import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, moxfieldCollectionId: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(users);
  } catch (error) {
    console.error('Failed to list users:', error);
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, moxfieldCollectionId } = await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (!moxfieldCollectionId || !moxfieldCollectionId.trim()) {
      return NextResponse.json({ error: 'Moxfield Collection ID is required' }, { status: 400 });
    }

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        moxfieldCollectionId: moxfieldCollectionId.trim(),
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A user with this Moxfield Collection ID already exists' },
        { status: 409 }
      );
    }
    console.error('Failed to add user:', error);
    return NextResponse.json({ error: 'Failed to add user' }, { status: 500 });
  }
}
