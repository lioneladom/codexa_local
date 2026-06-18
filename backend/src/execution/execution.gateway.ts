import {
  WebSocketGateway,
  SubscribeMessage,
  WebSocketServer,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { spawn, execFileSync, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

@WebSocketGateway({ cors: true })
export class ExecutionGateway {
  @WebSocketServer()
  server: Server;

  private readonly tempDir = path.join(os.tmpdir(), 'codexa-executions');

  @SubscribeMessage('runCode')
  async handleRunCode(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { code: string; language: string; timeLimitSec?: number },
  ) {
    const { code, language, timeLimitSec = 300 } = payload;
    const startTime = Date.now();
    const execId = Date.now().toString(36) + Math.random().toString(36).substring(2);
    const workDir = path.join(this.tempDir, execId);

    let child: ChildProcess | null = null;
    let inputListener: ((data: string) => void) | null = null;
    let isCleanedUp = false;

    const cleanup = async () => {
      if (isCleanedUp) return;
      isCleanedUp = true;

      // Remove socket event listener if it was registered
      if (inputListener) {
        client.off('terminalInput', inputListener);
      }

      // Terminate child process group if still running
      if (child && child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch (err) {
          try {
            child.kill('SIGKILL');
          } catch (e) {}
        }
      }

      // Delete the work directory
      try {
        await fs.rm(workDir, { recursive: true, force: true });
      } catch (err) {
        console.error('Failed to clean up work directory:', err);
      }
    };

    // Keep track of disconnect
    client.on('disconnect', () => {
      cleanup();
    });

    try {
      // Ensure base directory exists and create work directory
      await fs.mkdir(this.tempDir, { recursive: true });
      await fs.mkdir(workDir, { recursive: true });

      let command: string;
      let args: string[];
      let filename: string;

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
          client.emit('terminalOutput', 'Compiling C++ code...\r\n');
          try {
            await execAsync('g++ main.cpp -o a.out', { cwd: workDir, timeout: 10000 });
          } catch (err: any) {
            client.emit('terminalOutput', `Compilation Error:\r\n${err.stderr || err.message}\r\n`);
            client.emit('terminalExit', { code: 1 });
            await cleanup();
            return;
          }
          command = './a.out';
          args = [];
          break;
        case 'c':
          filename = 'main.c';
          await fs.writeFile(path.join(workDir, filename), code);
          client.emit('terminalOutput', 'Compiling C code...\r\n');
          try {
            await execAsync('gcc main.c -o a.out', { cwd: workDir, timeout: 10000 });
          } catch (err: any) {
            client.emit('terminalOutput', `Compilation Error:\r\n${err.stderr || err.message}\r\n`);
            client.emit('terminalExit', { code: 1 });
            await cleanup();
            return;
          }
          command = './a.out';
          args = [];
          break;
        case 'java':
          filename = 'Main.java';
          // Find Main class or use default Main
          const match = code.match(/public\s+class\s+(\w+)/);
          const className = match ? match[1] : 'Main';
          filename = `${className}.java`;
          await fs.writeFile(path.join(workDir, filename), code);
          client.emit('terminalOutput', `Compiling Java class ${className}...\r\n`);
          try {
            await execAsync(`javac ${filename}`, { cwd: workDir, timeout: 10000 });
          } catch (err: any) {
            client.emit('terminalOutput', `Compilation Error:\r\n${err.stderr || err.message}\r\n`);
            client.emit('terminalExit', { code: 1 });
            await cleanup();
            return;
          }
          command = 'java';
          args = [className];
          break;
        case 'csharp':
        case 'cs':
        case 'c#':
          filename = 'Program.cs';
          await fs.writeFile(path.join(workDir, filename), code);
          client.emit('terminalOutput', 'Compiling C# code...\r\n');
          try {
            await execAsync('mcs Program.cs -out:Program', { cwd: workDir, timeout: 10000 });
          } catch (err: any) {
            client.emit('terminalOutput', `Compilation Error:\r\n${err.stderr || err.message}\r\n`);
            client.emit('terminalExit', { code: 1 });
            await cleanup();
            return;
          }
          command = './Program';
          args = [];
          break;
        case 'go':
        case 'golang':
          filename = 'main.go';
          await fs.writeFile(path.join(workDir, filename), code);
          client.emit('terminalOutput', 'Compiling Go code...\r\n');
          try {
            await execAsync('go build -o main main.go', { cwd: workDir, timeout: 10000 });
          } catch (err: any) {
            client.emit('terminalOutput', `Compilation Error:\r\n${err.stderr || err.message}\r\n`);
            client.emit('terminalExit', { code: 1 });
            await cleanup();
            return;
          }
          command = './main';
          args = [];
          break;
        default:
          client.emit('terminalOutput', `Unsupported language: ${language}\r\n`);
          client.emit('terminalExit', { code: 1 });
          await cleanup();
          return;
      }

      // Use script utility to allocate a pseudo-terminal (PTY) on Linux
      const scriptCommand = 'script';
      const cmdString = args.length > 0 
        ? `${command} ${args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ')}`
        : command;
      const scriptArgs = ['-e', '-q', '-c', cmdString, '/dev/null'];

      // Spawn execution process in a new process group (detached: true)
      child = spawn(scriptCommand, scriptArgs, { 
        cwd: workDir, 
        env: { ...process.env, TERM: 'xterm-256color' },
        detached: true
      });

      // Forward output streams to client
      child.stdout?.on('data', (chunk) => {
        client.emit('terminalOutput', chunk.toString());
      });

      child.stderr?.on('data', (chunk) => {
        client.emit('terminalOutput', chunk.toString());
      });

      // Handle input from client
      inputListener = (data: string) => {
        if (child && child.stdin && child.stdin.writable) {
          child.stdin.write(data);
        }
      };
      client.on('terminalInput', inputListener);

      // Handle process completion
      child.on('close', (code, signal) => {
        client.emit('terminalExit', { code: code ?? 0, signal });
        cleanup();
      });

      child.on('error', (err) => {
        client.emit('terminalOutput', `Execution error: ${err.message}\r\n`);
        client.emit('terminalExit', { code: 1 });
        cleanup();
      });

      // Set timeout
      setTimeout(() => {
        if (child && child.exitCode === null && child.signalCode === null) {
          client.emit('terminalOutput', `\r\nProcess timed out after ${timeLimitSec} seconds.\r\n`);
          cleanup();
        }
      }, timeLimitSec * 1000);

    } catch (err: any) {
      client.emit('terminalOutput', `Internal execution gateway error: ${err.message}\r\n`);
      client.emit('terminalExit', { code: 1 });
      await cleanup();
    }
  }
}
