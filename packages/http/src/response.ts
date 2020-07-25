import { FastifyReply } from 'fastify';

export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  timestamp: string;
  requestId?: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
  requestId?: string;
}

export interface PaginatedResponse<T = any> extends SuccessResponse<T[]> {
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export function sendSuccess<T>(reply: FastifyReply, data: T, statusCode = 200): FastifyReply {
  return reply.code(statusCode).send({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  } as SuccessResponse<T>);
}

export function sendError(reply: FastifyReply, error: string, message: string, statusCode = 500, details?: Record<string, any>): FastifyReply {
  return reply.code(statusCode).send({
    success: false,
    error,
    message,
    details,
    timestamp: new Date().toISOString(),
  } as ErrorResponse);
}

export function sendPaginated<T>(reply: FastifyReply, data: T[], total: number, page: number, limit: number): FastifyReply {
  return reply.code(200).send({
    success: true,
    data,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
    timestamp: new Date().toISOString(),
  } as PaginatedResponse<T>);
}

export function sendNoContent(reply: FastifyReply): FastifyReply {
  return reply.code(204).send();
}

export function sendCreated<T>(reply: FastifyReply, data: T): FastifyReply {
  return sendSuccess(reply, data, 201);
}

export function sendOk<T>(reply: FastifyReply, data: T): FastifyReply {
  return sendSuccess(reply, data, 200);
}
