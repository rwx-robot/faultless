import { describe, it, expect, beforeEach } from 'vitest';
import 'reflect-metadata';
import {
  Module,
  Global,
  Injectable,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Inject,
  Optional,
  Param,
  Body,
  Query,
  Headers,
  Session,
  Req,
  Res,
  Next,
  UseGuards,
  UseInterceptors,
  UsePipes,
  UseFilters,
  UseMiddleware,
  SetMetadata,
  getRouteMetadata,
  getControllerPrefix,
  isController,
  isProvider,
  isModule,
  getModuleMetadata,
  getInjectableOptions,
  getInjectTokens,
  getOptionalParams,
  getParamMetadata,
} from '../src/decorators';

describe('decorators', () => {
  beforeEach(() => {
    // Clear metadata by creating fresh classes
  });

  describe('Module', () => {
    it('should attach module metadata', () => {
      @Module({
        imports: [],
        controllers: [],
        providers: [],
      })
      class TestModule {}

      expect(isModule(TestModule)).toBe(true);
      const metadata = getModuleMetadata(TestModule);
      expect(metadata).toEqual({
        imports: [],
        controllers: [],
        providers: [],
      });
    });
  });

  describe('Global', () => {
    it('should mark module as global', () => {
      @Global()
      @Module({})
      class GlobalModule {}

      // Global is stored as separate metadata
      expect(isModule(GlobalModule)).toBe(true);
    });
  });

  describe('Injectable', () => {
    it('should attach injectable metadata with default scope', () => {
      @Injectable()
      class TestService {}

      expect(isProvider(TestService)).toBe(true);
      const options = getInjectableOptions(TestService);
      expect(options).toEqual({ scope: 'singleton' });
    });

    it('should attach injectable metadata with custom scope', () => {
      @Injectable({ scope: 'request' })
      class RequestService {}

      const options = getInjectableOptions(RequestService);
      expect(options).toEqual({ scope: 'request' });
    });
  });

  describe('Controller', () => {
    it('should attach controller metadata with prefix', () => {
      @Controller('users')
      class UsersController {}

      expect(isController(UsersController)).toBe(true);
      expect(getControllerPrefix(UsersController)).toBe('users');
    });

    it('should use empty prefix by default', () => {
      @Controller()
      class RootController {}

      expect(getControllerPrefix(RootController)).toBe('');
    });
  });

  describe('HTTP method decorators', () => {
    it('should attach route metadata', () => {
      @Controller('test')
      class TestController {
        @Get()
        getAll() {}

        @Get('detail')
        getDetail() {}

        @Post()
        create() {}

        @Put('update')
        update() {}

        @Delete('remove')
        remove() {}
      }

      const routes = getRouteMetadata(TestController);
      expect(routes).toHaveLength(5);
      expect(routes[0]).toEqual({ method: 'GET', path: '', handler: 'getAll' });
      expect(routes[1]).toEqual({ method: 'GET', path: 'detail', handler: 'getDetail' });
      expect(routes[2]).toEqual({ method: 'POST', path: '', handler: 'create' });
      expect(routes[3]).toEqual({ method: 'PUT', path: 'update', handler: 'update' });
      expect(routes[4]).toEqual({ method: 'DELETE', path: 'remove', handler: 'remove' });
    });
  });

  describe('Parameter decorators', () => {
    it('should collect param metadata', () => {
      @Controller()
      class TestController {
        testMethod(
          @Param('id') id: string,
          @Body() body: unknown,
          @Query('page') page: string,
          @Headers('authorization') auth: string,
          @Session('user') user: unknown,
          @Req() req: unknown,
          @Res() res: unknown,
          @Next() next: unknown,
        ) {}
      }

      const params = getParamMetadata(TestController, 'testMethod');
      expect(params).toHaveLength(8);
      expect(params[0]).toEqual({ index: 0, name: 'id', type: 'param' });
      expect(params[1]).toEqual({ index: 1, type: 'body' });
      expect(params[2]).toEqual({ index: 2, name: 'page', type: 'query' });
      expect(params[3]).toEqual({ index: 3, name: 'authorization', type: 'headers' });
      expect(params[4]).toEqual({ index: 4, name: 'user', type: 'session' });
      expect(params[5]).toEqual({ index: 5, type: 'req' });
      expect(params[6]).toEqual({ index: 6, type: 'res' });
      expect(params[7]).toEqual({ index: 7, type: 'next' });
    });
  });

  describe('Inject', () => {
    it('should attach inject token to parameter', () => {
      @Injectable()
      class TestService {
        constructor(
          @Inject('CONFIG') config: unknown,
          @Inject() other: unknown,
        ) {}
      }

      const tokens = getInjectTokens(TestService);
      expect(tokens).toEqual(['CONFIG', undefined]);
    });

    it('should attach inject token to property', () => {
      @Injectable()
      class TestService {
        @Inject('CONFIG')
        config: unknown;
      }

      // Property injection metadata is stored differently
      // This tests the property decorator path
    });
  });

  describe('Optional', () => {
    it('should mark parameter as optional', () => {
      @Injectable()
      class TestService {
        constructor(
          @Optional() optional: unknown,
          required: unknown,
        ) {}
      }

      const optionalParams = getOptionalParams(TestService);
      expect(optionalParams).toEqual([0]);
    });
  });

  describe('UseGuards', () => {
    it('should attach guards to class', () => {
      class Guard1 {}
      class Guard2 {}

      @UseGuards(Guard1, Guard2)
      @Controller()
      class TestController {}

      // Metadata is attached to class
    });

    it('should attach guards to method', () => {
      class Guard1 {}

      @Controller()
      class TestController {
        @UseGuards(Guard1)
        testMethod() {}
      }
    });
  });

  describe('UseInterceptors', () => {
    it('should attach interceptors', () => {
      class Interceptor1 {}

      @UseInterceptors(Interceptor1)
      @Controller()
      class TestController {}
    });
  });

  describe('UsePipes', () => {
    it('should attach pipes', () => {
      class Pipe1 {}

      @UsePipes(Pipe1)
      @Controller()
      class TestController {}
    });
  });

  describe('UseFilters', () => {
    it('should attach filters', () => {
      class Filter1 {}

      @UseFilters(Filter1)
      @Controller()
      class TestController {}
    });
  });

  describe('UseMiddleware', () => {
    it('should attach middlewares', () => {
      class Middleware1 {}

      @UseMiddleware(Middleware1)
      @Controller()
      class TestController {}
    });
  });

  describe('SetMetadata', () => {
    it('should set custom metadata', () => {
      @SetMetadata('custom', 'value')
      @Controller()
      class TestController {}
    });
  });
});