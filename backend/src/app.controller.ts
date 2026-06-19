import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import * as os from 'os';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('network/ips')
  getNetworkIps() {
    const interfaces = os.networkInterfaces();
    const ipAddresses: { interface: string; address: string; type: string }[] = [];

    for (const name of Object.keys(interfaces)) {
      const netList = interfaces[name];
      if (!netList) continue;
      for (const net of netList) {
        if (net.family === 'IPv4' && !net.internal) {
          let type = 'Other Network';
          const lowercaseName = name.toLowerCase();
          if (lowercaseName.startsWith('docker') || lowercaseName.startsWith('br-') || lowercaseName.startsWith('veth') || lowercaseName.startsWith('virbr')) {
            type = 'Virtual/Docker';
          } else if (lowercaseName.startsWith('wlan') || lowercaseName.startsWith('wlp') || lowercaseName.startsWith('wl') || lowercaseName.startsWith('ap')) {
            type = 'Wi-Fi / Hotspot';
          } else if (lowercaseName.startsWith('eth') || lowercaseName.startsWith('enp') || lowercaseName.startsWith('en')) {
            type = 'Ethernet / Wired';
          }
          ipAddresses.push({ interface: name, address: net.address, type });
        }
      }
    }

    // Get Wi-Fi SSID
    let ssid: string | null = null;
    try {
      const platform = os.platform();
      const { execSync } = require('child_process');
      if (platform === 'linux') {
        try {
          ssid = execSync('iwgetid -r', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
        } catch {
          ssid = execSync('nmcli -t -f active,ssid dev wifi | grep "^yes" | cut -d: -f2', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
        }
      } else if (platform === 'win32') {
        const output = execSync('netsh wlan show interfaces', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        const match = output.match(/^\s*SSID\s*:\s*(.+)$/m);
        if (match && match[1]) {
          ssid = match[1].trim();
        }
      } else if (platform === 'darwin') {
        const output = execSync('/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        const match = output.match(/^\s*SSID\s*:\s*(.+)$/m);
        if (match && match[1]) {
          ssid = match[1].trim();
        }
      }
    } catch (err) {
      // Ignore errors if Wi-Fi commands fail or are unavailable
    }

    return { ssid, ips: ipAddresses };
  }
}
