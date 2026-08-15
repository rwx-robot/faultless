import { bench, describe } from 'vitest';
import 'reflect-metadata';
import {
  Injectable,
  Controller,
  Module,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UsePipes,
  getRouteMetadata,
  getControllerPrefix,
  isController,
  isProvider,
  getInjectableOptions,
  defineMetadata,
  getMetadata,
  hasMetadata,
} from '@faultless/core';
import {
  NofaultError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  TooManyRequestsError,
  CircuitBreakerOpenError,
  RateLimitExceededError,
  isNofaultError,
  isRetryableError,
} from '@faultless/core';

// ─── Test classes ────────────────────────────────────────────────────────────

@Injectable()
class UserService {
  findById(id: string) {
    return { id, name: 'test' };
  }
}

@Injectable({ scope: 'transient' })
class TransientService {}

@Controller('users')
class UserController {
  @Get(':id')
  async findOne(@Param('id') id: string) {}

  @Post()
  async create(@Body() body: any) {}

  @Get()
  async findAll(@Query('page') page: string) {}
}

@Injectable()
class AuthGuard {
  canActivate() {
    return true;
  }
}

@Controller('posts')
@UseGuards(AuthGuard)
class PostController {
  @Get(':id')
  async findOne(@Param('id') id: string) {}
}

@Module({
  controllers: [UserController, PostController],
  providers: [UserService, TransientService, AuthGuard],
})
class AppModule {}

// ─── Raw metadata operations ─────────────────────────────────────────────────

describe('Decorator metadata: defineMetadata', () => {
  const target = class {};

  bench('define single metadata', () => {
    defineMetadata('test:key', { value: 42 }, target);
  });

  bench('define metadata (10 keys)', () => {
    for (let i = 0; i < 10; i++) {
      defineMetadata(`test:key-${i}`, { value: i }, target);
    }
  });
});

describe('Decorator metadata: readMetadata', () => {
  const target = class {};
  defineMetadata('test:read', { data: 'hello' }, target);

  bench('getMetadata', () => {
    getMetadata('test:read', target);
  });

  bench('hasMetadata', () => {
    hasMetadata('test:read', target);
  });
});

describe('Route metadata extraction', () => {
  bench('getRouteMetadata (UserController)', () => {
    getRouteMetadata(UserController);
  });

  bench('getControllerPrefix', () => {
    getControllerPrefix(UserController);
  });

  bench('isController check', () => {
    isController(UserController);
  });

  bench('isProvider check', () => {
    isProvider(UserService);
  });

  bench('getInjectableOptions', () => {
    getInjectableOptions(UserService);
  });
});

// ─── Error construction ──────────────────────────────────────────────────────

describe('Error construction', () => {
  bench('NofaultError (generic)', () => {
    new NofaultError('Something failed', 'GENERIC_ERROR', 500);
  });

  bench('ValidationError', () => {
    new ValidationError('Invalid input', 'email', { email: 'must be valid' });
  });

  bench('NotFoundError', () => {
    new NotFoundError('User', '123');
  });

  bench('UnauthorizedError', () => {
    new UnauthorizedError();
  });

  bench('ForbiddenError', () => {
    new ForbiddenError();
  });

  bench('TooManyRequestsError', () => {
    new TooManyRequestsError('Slow down', 60);
  });

  bench('CircuitBreakerOpenError', () => {
    new CircuitBreakerOpenError('Service unavailable');
  });

  bench('RateLimitExceededError', () => {
    new RateLimitExceededError(100, 0, new Date());
  });
});

describe('Error type checks', () => {
  const FaultlessErr = new NofaultError('test', 'TEST', 500);
  const validationErr = new ValidationError('bad');
  const notFoundErr = new NotFoundError('Item');
  const plainErr = new Error('plain');

  bench('isNofaultError (Faultless)', () => {
    isNofaultError(FaultlessErr);
  });

  bench('isNofaultError (plain Error)', () => {
    isNofaultError(plainErr);
  });

  bench('isRetryableError (retryable)', () => {
    isRetryableError(new TooManyRequestsError());
  });

  bench('isRetryableError (non-retryable)', () => {
    isRetryableError(new ValidationError('bad'));
  });
});

describe('Error serialization (toJSON)', () => {
  const err = new NofaultError('Something failed', 'GENERIC_ERROR', 500, { extra: 'data' }, 'req_123');

  bench('toJSON', () => {
    err.toJSON();
  });
});
