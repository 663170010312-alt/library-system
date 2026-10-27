
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const filename =
    request.nextUrl.searchParams.get('file') || '';

  const allowedChars =
    'abcdefghijklmnopqrstuvwxyz' +
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
    '0123456789._-';

  const validName =
    filename.length > 0 &&
    filename.length <= 255 &&
    !filename.includes('..') &&
    [...filename].every((char) =>
      allowedChars.includes(char)
    );

  const validExtension = [
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
  ].some((ext) =>
    filename.toLowerCase().endsWith(ext)
  );

  if (!validName || !validExtension) {
    return new NextResponse('Invalid filename', {
      status: 400,
    });
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    return new NextResponse('API URL not configured', {
      status: 503,
    });
  }

  try {
    const backend = new URL(apiUrl);

    if (
      backend.protocol !== 'https:' &&
      backend.hostname !== 'localhost' &&
      backend.hostname !== '127.0.0.1'
    ) {
      throw new Error('Invalid backend URL');
    }

    const imageUrl =
      backend.origin +
      '/uploads/covers/' +
      encodeURIComponent(filename);

    const response = await fetch(imageUrl, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return new NextResponse('Image not found', {
        status: response.status === 404 ? 404 : 502,
      });
    }

    const contentType =
      response.headers.get('content-type') || '';

    if (
      ![
        'image/png',
        'image/jpeg',
        'image/webp',
      ].includes(contentType.split(';')[0].trim().toLowerCase())
    ) {
      return new NextResponse('Invalid image response', {
        status: 502,
      });
    }

    const imageBuffer = await response.arrayBuffer();

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Book cover error:', error);

    return new NextResponse('Cannot load image', {
      status: 502,
    });
  }
}
