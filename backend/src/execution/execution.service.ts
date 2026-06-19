import { Injectable } from '@nestjs/common';
import { execFile, spawn, execFileSync } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execFileAsync = promisify(execFile);

export interface ExecutionResult {
  success: boolean;
  output: string;
  error: string;
  duration: number;
}

export interface OutputMatchResult {
  passed: boolean;
  quality: 'exact' | 'normalized' | 'final-answer' | 'failed';
}

@Injectable()
export class ExecutionService {
  private readonly tempDir = path.join(os.tmpdir(), 'codexa-executions');

  static matchOutputs(actual: string, expected: string): OutputMatchResult {
    actual = actual.trim();
    expected = expected.trim();
    if (actual === expected) return { passed: true, quality: 'exact' };
    if (ExecutionService.collapseWhitespace(actual) === ExecutionService.collapseWhitespace(expected)) return { passed: true, quality: 'normalized' };
    if (expected && ExecutionService.getLastMeaningfulToken(actual) === ExecutionService.getLastMeaningfulToken(expected)) return { passed: true, quality: 'final-answer' };
    return { passed: false, quality: 'failed' };
  }

  private static collapseWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  private static getLastMeaningfulToken(value: string): string {
    const tokens = value.match(/-?\d+(?:\.\d+)?|[A-Za-z0-9_./-]+/g);
    return tokens ? tokens[tokens.length - 1].toLowerCase() : ExecutionService.collapseWhitespace(value).toLowerCase();
  }

  async onModuleInit() {
    try {
      await fs.access(this.tempDir);
    } catch {
      await fs.mkdir(this.tempDir, { recursive: true });
    }
  }

  async executeCode(language: string, code: string, input?: string): Promise<ExecutionResult> {
    const startTime = Date.now();
    const execId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const workDir = path.join(this.tempDir, execId);

    try {
      await fs.mkdir(workDir, { recursive: true });

      let command: string;
      let args: string[];
      let filename: string;

      const isWindows = os.platform() === 'win32';

      switch (language.toLowerCase()) {
        case 'javascript':
        case 'js':
          filename = 'main.js';
          await fs.writeFile(path.join(workDir, filename), code);
          command = 'node';
          args = [filename];
          break;
        case 'python':
        case 'py':
          filename = 'main.py';
          await fs.writeFile(path.join(workDir, filename), code);
          // Try python3 first, then fall back to python
          let pythonCmd = 'python3';
          try {
            execFileSync(pythonCmd, ['--version'], { stdio: 'ignore' });
          } catch (e) {
            pythonCmd = 'python';
          }
          command = pythonCmd;
          args = [filename];
          break;
        case 'cpp':
        case 'c++':
          filename = 'main.cpp';
          await fs.writeFile(path.join(workDir, filename), code);
          await this.compileCpp(workDir, filename);
          command = path.join(workDir, isWindows ? 'a.exe' : 'a.out');
          args = [];
          break;
        case 'c':
          filename = 'main.c';
          await fs.writeFile(path.join(workDir, filename), code);
          await this.compileC(workDir, filename);
          command = path.join(workDir, isWindows ? 'a.exe' : 'a.out');
          args = [];
          break;
        case 'java':
          filename = 'Main.java';
          await fs.writeFile(path.join(workDir, filename), code);
          await this.compileJava(workDir, filename);
          command = 'java';
          args = ['Main'];
          break;
        case 'csharp':
        case 'cs':
        case 'c#':
          filename = 'Program.cs';
          await fs.writeFile(path.join(workDir, filename), code);
          await this.compileCSharp(workDir, filename);
          command = path.join(workDir, isWindows ? 'Program.exe' : 'Program');
          args = [];
          break;
        case 'go':
        case 'golang':
          filename = 'main.go';
          await fs.writeFile(path.join(workDir, filename), code);
          await this.compileGo(workDir, filename);
          command = path.join(workDir, isWindows ? 'main.exe' : 'main');
          args = [];
          break;
        default:
          throw new Error(`Unsupported language: ${language}`);
      }

      const result = await this.runCommand(command, args, workDir, input);
      result.duration = Date.now() - startTime;
      return result;
    } catch (err: any) {
      console.error('Code execution error:', err);
      return {
        success: false,
        output: '',
        error: err.message || 'Internal execution error',
        duration: Date.now() - startTime,
      };
    } finally {
      try {
        await fs.rm(workDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.error('Cleanup error:', cleanupErr);
      }
    }
  }

  private async compileCpp(workDir: string, filename: string): Promise<void> {
    const isWindows = os.platform() === 'win32';
    const outputName = isWindows ? 'a.exe' : 'a.out';
    const { stderr } = await execFileAsync('g++', [filename, '-o', outputName], {
      cwd: workDir,
      timeout: 10000,
    });
    if (stderr) throw new Error(stderr);
  }

  private async compileJava(workDir: string, filename: string): Promise<void> {
    const { stderr } = await execFileAsync('javac', [filename], {
      cwd: workDir,
      timeout: 10000,
    });
    if (stderr) throw new Error(stderr);
  }

  private async compileC(workDir: string, filename: string): Promise<void> {
    const isWindows = os.platform() === 'win32';
    const outputName = isWindows ? 'a.exe' : 'a.out';
    const { stderr } = await execFileAsync('gcc', [filename, '-o', outputName], {
      cwd: workDir,
      timeout: 10000,
    });
    if (stderr) throw new Error(stderr);
  }

  private async compileCSharp(workDir: string, filename: string): Promise<void> {
    const isWindows = os.platform() === 'win32';
    const outputName = isWindows ? 'Program.exe' : 'Program';
    const compiler = isWindows ? 'csc' : 'mcs';
    const { stderr } = await execFileAsync(compiler, [filename, `-out:${outputName}`], {
      cwd: workDir,
      timeout: 10000,
    });
    if (stderr) throw new Error(stderr);
  }

  private async compileGo(workDir: string, filename: string): Promise<void> {
    const isWindows = os.platform() === 'win32';
    const outputName = isWindows ? 'main.exe' : 'main';
    const { stderr } = await execFileAsync('go', ['build', '-o', outputName, filename], {
      cwd: workDir,
      timeout: 10000,
    });
    if (stderr) throw new Error(stderr);
  }

  private runCommand(
    command: string,
    args: string[],
    cwd: string,
    input?: string,
  ): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const child = spawn(command, args, { cwd, timeout: 5000 });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          output: stdout.trim(),
          error: stderr.trim(),
          duration: 0,
        });
      });

      child.on('error', (err) => {
        resolve({
          success: false,
          output: '',
          error: err.message,
          duration: 0,
        });
      });

      if (input) {
        child.stdin.write(input);
        child.stdin.end();
      }
    });
  }
}
