import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await prisma.user.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    console.error('Failed to delete user:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const moxfieldCollectionId = body?.moxfieldCollectionId?.trim();
    if (!moxfieldCollectionId) {
      return NextResponse.json({ error: 'Collection ID is required' }, { status: 400 });
    }
    const user = await prisma.user.update({
      where: { id },
      data: { moxfieldCollectionId },
      select: { id: true, name: true, moxfieldCollectionId: true },
    });
    return NextResponse.json(user);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Collection ID already in use' }, { status: 409 });
    }
    console.error('Failed to update collection ID:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
