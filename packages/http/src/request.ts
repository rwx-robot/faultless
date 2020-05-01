import { FastifyRequest, FastifyReply } from 'fastify';

export interface RequestWithExtensions extends FastifyRequest {
  requestId?: string;
  user?: any;
  session?: Record<string, any>;
}

export interface ReplyWithExtensions extends FastifyReply {
  sent: boolean;
}

export function getRequestId(request: FastifyRequest): string {
  return (request.headers['x-request-id'] as string) ?? 'unknown';
}

export function getUser<T = any>(request: FastifyRequest): T | undefined {
  return (request as any).user;
}

export function setUser(request: FastifyRequest, user: any): void {
  (request as any).user = user;
}

export function getSession(request: FastifyRequest): Record<string, any> | undefined {
  return (request as any).session;
}

export function setSession(request: FastifyRequest, session: Record<string, any>): void {
  (request as any).session = session;
}

export function getRequestIp(request: FastifyRequest): string {
  return request.ip ?? request.headers['x-forwarded-for'] as string ?? 'unknown';
}

export function getUserAgent(request: FastifyRequest): string | undefined {
  return request.headers['user-agent'];
}

export function getBearerToken(request: FastifyRequest): string | undefined {
  const auth = request.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return undefined;
}

export function setCookie(
  reply: FastifyReply,
  name: string,
  value: string,
  options: {
    maxAge?: number;
    expires?: Date;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'lax' | 'strict' | 'none';
    path?: string;
    domain?: string;
  } = {}
): void {
  reply.setCookie(name, value, {
    maxAge: options.maxAge,
    expires: options.expires,
    httpOnly: options.httpOnly ?? true,
    secure: options.secure ?? true,
    sameSite: options.sameSite ?? 'lax',
    path: options.path ?? '/',
    domain: options.domain,
  });
}

export function clearCookie(reply: FastifyReply, name: string, options: { path?: string; domain?: string } = {}): void {
  reply.clearCookie(name, {
    path: options.path ?? '/',
    domain: options.domain,
  });
}

export function getCookie(request: FastifyRequest, name: string): string | undefined {
  return request.cookies?.[name];
}

export function redirect(reply: FastifyReply, url: string, statusCode = 302): void {
  reply.redirect(statusCode, url);
}

export function setHeader(reply: FastifyReply, name: string, value: string): void {
  reply.header(name, value);
}

export function getHeader(request: FastifyRequest, name: string): string | undefined {
  return request.headers[name.toLowerCase()];
}

export function status(reply: FastifyReply, code: number): FastifyReply {
  return reply.code(code);
}

export function send(reply: FastifyReply, data: any): FastifyReply {
  return reply.send(data);
}

export function json(reply: FastifyReply, data: any): FastifyReply {
  return reply.header('Content-Type', 'application/json').send(data);
}

export function text(reply: FastifyReply, data: string): FastifyReply {
  return reply.header('Content-Type', 'text/plain').send(data);
}

export function html(reply: FastifyReply, data: string): FastifyReply {
  return reply.header('Content-Type', 'text/html').send(data);
}

export function file(reply: FastifyReply, path: string, filename?: string): FastifyReply {
  return reply.sendFile(path, filename);
}

export function stream(reply: FastifyReply, stream: NodeJS.ReadableStream): FastifyReply {
  return reply.send(stream);
}