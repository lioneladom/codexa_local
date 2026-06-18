import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { io, Socket } from 'socket.io-client';

import { getSocketUrl } from '@/config/api';

interface Props {
  code: string;
  language: string;
  runId: number;
  timeLimitSec: number;
  isRunning: boolean;
  onExit: () => void;
}

export default function RunTerminal({ code, language, runId, timeLimitSec, isRunning, onExit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const onExitRef = useRef(onExit);
  
  // Keep onExit callback fresh
  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  // 1. Initialize Terminal once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      convertEol: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', monospace",
      theme: {
        background: '#060814',
        foreground: '#4ade80',
        cursor: '#4ade80',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, []);

  // 2. Handle Run / Stop lifecycle
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    // Cleanup previous socket if any
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    if (!isRunning) {
      return;
    }

    // Clear terminal for the new run
    term.clear();
    term.write('\x1b[H\x1b[2J'); // reset cursor position and clear screen

    const socket = io(getSocketUrl());
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('runCode', { code, language, timeLimitSec });
    });

    socket.on('terminalOutput', (data: string) => {
      term.write(data);
    });

    socket.on('terminalExit', (data: { code: number; signal?: string }) => {
      term.writeln(`\r\n\r\n[Process completed (exit code: ${data.code})]\r`);
      socket.disconnect();
      socketRef.current = null;
      onExitRef.current(); // notify parent that it stopped running
    });

    socket.on('connect_error', (err) => {
      term.writeln(`\r\n[Connection failure: ${err.message}]\r`);
      socket.disconnect();
      socketRef.current = null;
      onExitRef.current();
    });

    // Clean up socket listener when runId or isRunning changes
    return () => {
      if (socketRef.current) {
        term.writeln('\r\n\r\n[Process terminated by user]\r');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [runId, isRunning, code, language, timeLimitSec]);

  // 3. Handle terminal user input
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const disposable = term.onData((data) => {
      const socket = socketRef.current;
      if (socket && socket.connected) {
        socket.emit('terminalInput', data);
      }
    });

    return () => {
      disposable.dispose();
    };
  }, [runId]); // Rebind input listener when run starts

  return (
    <div
      ref={containerRef}
      data-exam-typing-area="true"
      style={{ height: '100%', width: '100%', background: '#060814', padding: '12px' }}
      className="rounded-b-2xl"
    />
  );
}
