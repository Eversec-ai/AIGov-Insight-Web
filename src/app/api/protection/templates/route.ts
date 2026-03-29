import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const TEMPLATES_DIR = '/root/.openclaw/extensions/aigov-insight/templates';

interface RuleTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  rules: {
    block: Record<string, string>;
    confirm: Record<string, string>;
    warn: Record<string, string>;
  };
  stats: {
    totalRules: number;
    blockCount: number;
    confirmCount: number;
    warnCount: number;
  };
}

export async function GET() {
  try {
    const files = await fs.readdir(TEMPLATES_DIR);
    const templates: RuleTemplate[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(TEMPLATES_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        
        const blockCount = data.block ? Object.keys(data.block).length : 0;
        const confirmCount = data.confirm ? Object.keys(data.confirm).length : 0;
        const warnCount = data.warn ? Object.keys(data.warn).length : 0;
        
        templates.push({
          id: file.replace('.json', ''),
          name: data._meta?.name || file.replace('.json', ''),
          description: data._meta?.description || '',
          version: data._meta?.version || '1.0',
          rules: {
            block: data.block || {},
            confirm: data.confirm || {},
            warn: data.warn || {},
          },
          stats: {
            totalRules: blockCount + confirmCount + warnCount,
            blockCount,
            confirmCount,
            warnCount,
          },
        });
      }
    }

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Error reading templates:', error);
    return NextResponse.json(
      { error: 'Failed to read templates', templates: [] },
      { status: 500 }
    );
  }
}
