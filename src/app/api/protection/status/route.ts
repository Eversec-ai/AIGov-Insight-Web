import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const STATUS_CACHE = {
  data: null as any,
  timestamp: 0,
  ttl: 3000,
};

async function getPluginStatus(): Promise<{ output: string; exitCode: number }> {
  try {
    const result = await execAsync('openclaw plugins info aigov-insight 2>&1', {
      timeout: 30000,
      killSignal: 'SIGKILL',
    });
    return {
      output: (result.stdout || '') + (result.stderr || ''),
      exitCode: 0,
    };
  } catch (execError: any) {
    const output = (execError.stdout || '') + (execError.stderr || '');
    const exitCode = execError.code || 1;
    
    if (execError.killed) {
      console.warn('Plugin status check timed out');
      return { output: '', exitCode: -1 };
    }
    
    return { output, exitCode };
  }
}

async function getOpenClawInfo(): Promise<{ openclawVersion?: string; gatewayPort?: string }> {
  let openclawVersion: string | undefined;
  let gatewayPort: string | undefined;
  
  try {
    const versionResult = await execAsync('openclaw --version 2>&1', {
      timeout: 5000,
      killSignal: 'SIGKILL',
    });
    const versionOutput = (versionResult.stdout || '') + (versionResult.stderr || '');
    const versionMatch = versionOutput.match(/OpenClaw\s+([\d.]+(?:\s+\([a-f0-9]+\))?)/);
    if (versionMatch) {
      openclawVersion = versionMatch[1];
    }
  } catch (execError: any) {
    console.warn('Failed to get OpenClaw version:', execError.message);
  }
  
  try {
    const lsofResult = await execAsync('lsof -i -P -n | grep openclaw 2>&1', {
      timeout: 5000,
      killSignal: 'SIGKILL',
    });
    const lsofOutput = (lsofResult.stdout || '') + (lsofResult.stderr || '');
    const lines = lsofOutput.split('\n');
    for (const line of lines) {
      if (line.includes('(LISTEN)')) {
        const portMatch = line.match(/:(\d+)\s*\(LISTEN\)/);
        if (portMatch) {
          gatewayPort = portMatch[1];
          break;
        }
      }
    }
  } catch (execError: any) {
    console.warn('Failed to get OpenClaw gateway port via lsof:', execError.message);
  }
  
  return { openclawVersion, gatewayPort };
}

function parseStatus(output: string, exitCode: number) {
  if (exitCode === -1) {
    return null;
  }
  
  if (exitCode === 1 && output.includes('Plugin not found')) {
    return {
      success: true,
      isEnabled: false,
      isInstalled: false,
      status: 'not_installed' as const,
      message: 'AIGov 防护服务未安装',
    };
  }
  
  const versionMatch = output.match(/Version:\s*([\d.]+)/);
  const version = versionMatch ? versionMatch[1] : undefined;
  
  if (output.includes('Status: loaded')) {
    return {
      success: true,
      isEnabled: true,
      isInstalled: true,
      status: 'loaded' as const,
      version,
      message: '防护已开启',
    };
  }
  
  if (output.includes('Status: disabled')) {
    return {
      success: true,
      isEnabled: false,
      isInstalled: true,
      status: 'disabled' as const,
      version,
      message: '防护已关闭',
    };
  }
  
  if (output.includes('aigov-insight') || output.includes('AIGov')) {
    return {
      success: true,
      isEnabled: false,
      isInstalled: true,
      status: 'disabled' as const,
      version,
      message: '防护已关闭',
    };
  }
  
  return null;
}

export async function GET() {
  try {
    const now = Date.now();
    if (STATUS_CACHE.data && (now - STATUS_CACHE.timestamp) < STATUS_CACHE.ttl) {
      return NextResponse.json(STATUS_CACHE.data);
    }
    
    const [{ output, exitCode }, openclawInfo] = await Promise.all([
      getPluginStatus(),
      getOpenClawInfo(),
    ]);
    let status = parseStatus(output, exitCode);
    
    if (!status) {
      const retry = await getPluginStatus();
      status = parseStatus(retry.output, retry.exitCode);
    }
    
    if (!status) {
      if (STATUS_CACHE.data) {
        return NextResponse.json(STATUS_CACHE.data);
      }
      
      return NextResponse.json({
        success: true,
        isEnabled: false,
        isInstalled: false,
        status: 'not_installed',
        message: 'AIGov 防护服务未安装',
        ...openclawInfo,
      });
    }
    
    status = { ...status, ...openclawInfo };
    
    STATUS_CACHE.data = status;
    STATUS_CACHE.timestamp = now;
    
    return NextResponse.json(status);
  } catch (error) {
    console.error('Error checking protection status:', error);
    
    if (STATUS_CACHE.data) {
      return NextResponse.json(STATUS_CACHE.data);
    }
    
    return NextResponse.json({
      success: false,
      isEnabled: false,
      isInstalled: false,
      status: 'error',
      message: '无法获取防护状态',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { enable } = body;
    
    const cmd = enable 
      ? 'openclaw plugins enable aigov-insight 2>&1'
      : 'openclaw plugins disable aigov-insight 2>&1';
    
    try {
      await execAsync(cmd, { timeout: 15000 });
    } catch (execError: any) {
      console.log('Toggle command output:', execError.stdout || execError.stderr);
    }
    
    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    
    try {
      const result = await execAsync('openclaw plugins info aigov-insight 2>&1', {
        timeout: 10000,
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (execError: any) {
      stdout = execError.stdout || '';
      stderr = execError.stderr || '';
      exitCode = execError.code || 1;
    }
    
    const output = stdout + stderr;
    
    if (exitCode === 1 && output.includes('Plugin not found')) {
      return NextResponse.json({
        success: false,
        isEnabled: false,
        isInstalled: false,
        status: 'not_installed',
        message: 'AIGov 防护服务未安装',
      });
    }
    
    const isEnabled = output.includes('Status: loaded');
    
    return NextResponse.json({
      success: enable ? isEnabled : !isEnabled,
      isEnabled,
      isInstalled: true,
      status: isEnabled ? 'loaded' : 'disabled',
      message: enable 
        ? (isEnabled ? '防护已成功开启' : '开启失败，请重试')
        : (!isEnabled ? '防护已成功关闭' : '关闭失败，请重试'),
    });
  } catch (error) {
    console.error('Error toggling protection:', error);
    return NextResponse.json({
      success: false,
      isEnabled: false,
      isInstalled: false,
      status: 'error',
      message: '操作失败，请检查权限或服务状态',
    }, { status: 500 });
  }
}
