import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getContractFile, getSignedUrl } from '@/lib/data/contracts';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await getCurrentUser();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const file = await getContractFile(id);
  if (!file) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const url = await getSignedUrl(file.storage_path, file.filename);
  return NextResponse.json({ url, filename: file.filename, mime_type: file.mime_type });
}
