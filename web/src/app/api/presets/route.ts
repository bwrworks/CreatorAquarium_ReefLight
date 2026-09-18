import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const PRESETS_FILE = path.join(process.cwd(), 'data', 'presets.json');

const defaultCustomPresets = [
  {
    id: 'preset_natural_glow',
    name: 'Soft Evening Glow',
    channels: {
      blue: 45,
      white: 10,
      uv: 25,
    },
    fan: 40,
  },
  {
    id: 'preset_deep_pop',
    name: 'Ultra Actinic Pop',
    channels: {
      blue: 60,
      white: 0,
      uv: 55,
    },
    fan: 45,
  },
];

async function ensureDirectoryExistence(filePath: string) {
  const dirname = path.dirname(filePath);
  try {
    await fs.access(dirname);
  } catch {
    await fs.mkdir(dirname, { recursive: true });
  }
}

export async function GET() {
  try {
    await ensureDirectoryExistence(PRESETS_FILE);
    try {
      const data = await fs.readFile(PRESETS_FILE, 'utf-8');
      const presets = JSON.parse(data);
      if (Array.isArray(presets)) {
        return NextResponse.json(presets);
      }
    } catch {
      // If file doesn't exist or corrupt, initialize with default
      await fs.writeFile(PRESETS_FILE, JSON.stringify(defaultCustomPresets, null, 2), 'utf-8');
      return NextResponse.json(defaultCustomPresets);
    }
    return NextResponse.json(defaultCustomPresets);
  } catch (error) {
    console.error('[API /api/presets GET Error]:', error);
    return NextResponse.json({ error: 'Failed to read presets' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: 'Expected array of presets' }, { status: 400 });
    }

    await ensureDirectoryExistence(PRESETS_FILE);
    await fs.writeFile(PRESETS_FILE, JSON.stringify(body, null, 2), 'utf-8');

    return NextResponse.json({ success: true, count: body.length });
  } catch (error) {
    console.error('[API /api/presets POST Error]:', error);
    return NextResponse.json({ error: 'Failed to save presets' }, { status: 500 });
  }
}
