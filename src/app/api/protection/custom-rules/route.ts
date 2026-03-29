import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';

const CUSTOM_RULES_PATH = '/root/.openclaw/extensions/aigov-insight/custom-rules.json';

export async function GET() {
  try {
    const content = await fs.readFile(CUSTOM_RULES_PATH, 'utf-8');
    const data = JSON.parse(content);
    
    const rules: Array<{
      id: string;
      pattern: string;
      description: string;
      type: 'block' | 'confirm' | 'warn';
    }> = [];
    
    let idCounter = 1;
    
    if (data.block) {
      for (const [pattern, description] of Object.entries(data.block)) {
        rules.push({
          id: `custom-block-${idCounter++}`,
          pattern,
          description: description as string,
          type: 'block',
        });
      }
    }
    
    if (data.confirm) {
      for (const [pattern, description] of Object.entries(data.confirm)) {
        rules.push({
          id: `custom-confirm-${idCounter++}`,
          pattern,
          description: description as string,
          type: 'confirm',
        });
      }
    }
    
    if (data.warn) {
      for (const [pattern, description] of Object.entries(data.warn)) {
        rules.push({
          id: `custom-warn-${idCounter++}`,
          pattern,
          description: description as string,
          type: 'warn',
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      rules,
      raw: data,
    });
  } catch (error) {
    console.error('Error reading custom rules:', error);
    return NextResponse.json(
      { error: 'Failed to read custom rules', rules: [], raw: {} },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pattern, description, type } = body;
    
    if (!pattern || !description || !type) {
      return NextResponse.json(
        { error: 'Pattern, description, and type are required' },
        { status: 400 }
      );
    }
    
    let content = '{}';
    try {
      content = await fs.readFile(CUSTOM_RULES_PATH, 'utf-8');
    } catch {
      // File doesn't exist, create empty object
    }
    
    const data = JSON.parse(content);
    
    if (!data[type]) {
      data[type] = {};
    }
    
    // Insert new rule at the beginning (preserve order of existing rules)
    const existingRules = data[type];
    const newRules: Record<string, string> = { [pattern]: description };
    for (const [key, value] of Object.entries(existingRules)) {
      newRules[key] = value as string;
    }
    data[type] = newRules;
    
    await fs.writeFile(CUSTOM_RULES_PATH, JSON.stringify(data, null, 2));
    
    return NextResponse.json({
      success: true,
      message: 'Rule added successfully',
      rule: { pattern, description, type },
    });
  } catch (error) {
    console.error('Error adding custom rule:', error);
    return NextResponse.json(
      { error: 'Failed to add custom rule' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { oldPattern, newPattern, description, type, oldType } = body;
    
    if (!oldPattern || !newPattern || !description || !type) {
      return NextResponse.json(
        { error: 'Old pattern, new pattern, description, and type are required' },
        { status: 400 }
      );
    }
    
    const content = await fs.readFile(CUSTOM_RULES_PATH, 'utf-8');
    const data = JSON.parse(content);
    
    // If type changed or pattern changed, we need to rebuild the order
    if (oldType !== type || oldPattern !== newPattern) {
      // Remove old rule from oldType
      if (oldType && data[oldType]) {
        const oldRules = data[oldType];
        const newOldRules: Record<string, string> = {};
        for (const [key, value] of Object.entries(oldRules)) {
          if (key !== oldPattern) {
            newOldRules[key] = value as string;
          }
        }
        data[oldType] = newOldRules;
      }
      
      // Add new rule to target type at the end (since it's a move)
      if (!data[type]) {
        data[type] = {};
      }
      data[type][newPattern] = description;
    } else {
      // Same type and same pattern - just update description in place
      if (data[type]) {
        // Rebuild to preserve order, updating the description
        const rules = data[type];
        const newRules: Record<string, string> = {};
        for (const [key, value] of Object.entries(rules)) {
          if (key === oldPattern) {
            newRules[key] = description;
          } else {
            newRules[key] = value as string;
          }
        }
        data[type] = newRules;
      }
    }
    
    await fs.writeFile(CUSTOM_RULES_PATH, JSON.stringify(data, null, 2));
    
    return NextResponse.json({
      success: true,
      message: 'Rule updated successfully',
    });
  } catch (error) {
    console.error('Error updating custom rule:', error);
    return NextResponse.json(
      { error: 'Failed to update custom rule' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pattern = searchParams.get('pattern');
    const type = searchParams.get('type');
    
    if (!pattern || !type) {
      return NextResponse.json(
        { error: 'Pattern and type are required' },
        { status: 400 }
      );
    }
    
    const content = await fs.readFile(CUSTOM_RULES_PATH, 'utf-8');
    const data = JSON.parse(content);
    
    if (data[type]) {
      delete data[type][pattern];
    }
    
    await fs.writeFile(CUSTOM_RULES_PATH, JSON.stringify(data, null, 2));
    
    return NextResponse.json({
      success: true,
      message: 'Rule deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting custom rule:', error);
    return NextResponse.json(
      { error: 'Failed to delete custom rule' },
      { status: 500 }
    );
  }
}
