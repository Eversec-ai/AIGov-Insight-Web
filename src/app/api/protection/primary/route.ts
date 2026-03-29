import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const PRIMARY_RULES_PATH = '/root/.openclaw/extensions/aigov-insight/primary-rules.json';
const TEMPLATES_DIR = '/root/.openclaw/extensions/aigov-insight/templates';

export async function GET() {
  try {
    const content = await fs.readFile(PRIMARY_RULES_PATH, 'utf-8');
    const data = JSON.parse(content);
    
    return NextResponse.json({
      success: true,
      primaryRules: {
        name: data._meta?.name || 'primary',
        description: data._meta?.description || '',
        version: data._meta?.version || '1.0',
        source: data._meta?.source || null,
        rules: {
          block: data.block || {},
          confirm: data.confirm || {},
          warn: data.warn || {},
        },
      },
    });
  } catch (error) {
    console.error('Error reading primary rules:', error);
    return NextResponse.json(
      { error: 'Failed to read primary rules', primaryRules: null },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { templateId } = body;
    
    if (!templateId) {
      return NextResponse.json(
        { error: 'Template ID is required' },
        { status: 400 }
      );
    }
    
    const templatePath = path.join(TEMPLATES_DIR, `${templateId}.json`);
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    const templateData = JSON.parse(templateContent);
    
    const primaryData = {
      ...templateData,
      _meta: {
        ...templateData._meta,
        source: templateId,
      },
    };
    
    await fs.writeFile(PRIMARY_RULES_PATH, JSON.stringify(primaryData, null, 2));
    
    return NextResponse.json({
      success: true,
      message: `Template "${templateId}" has been activated`,
      primaryRules: {
        name: primaryData._meta?.name,
        description: primaryData._meta?.description,
        version: primaryData._meta?.version,
        source: templateId,
        rules: {
          block: primaryData.block || {},
          confirm: primaryData.confirm || {},
          warn: primaryData.warn || {},
        },
      },
    });
  } catch (error) {
    console.error('Error activating template:', error);
    return NextResponse.json(
      { error: 'Failed to activate template' },
      { status: 500 }
    );
  }
}
