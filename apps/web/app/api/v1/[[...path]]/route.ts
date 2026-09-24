import { handleBackendRequest } from '../../../../lib/backend/handler';

export async function GET(request: Request): Promise<Response> {
  return handleBackendRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleBackendRequest(request);
}

export async function PUT(request: Request): Promise<Response> {
  return handleBackendRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleBackendRequest(request);
}

export async function PATCH(request: Request): Promise<Response> {
  return handleBackendRequest(request);
}
