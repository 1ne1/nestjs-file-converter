import { BadRequestException } from '@nestjs/common';

import { AllExceptionsFilter } from './all-exceptions.filter';

function makeHost() {
  const request = {};
  const response = {};
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as any;
}

describe('AllExceptionsFilter', () => {
  let httpAdapter: any;
  let httpAdapterHost: any;
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    httpAdapter = {
      getRequestMethod: jest.fn().mockReturnValue('GET'),
      getRequestUrl: jest.fn().mockReturnValue('/api/thing'),
      reply: jest.fn(),
    };
    httpAdapterHost = { httpAdapter };
    filter = new AllExceptionsFilter(httpAdapterHost);
  });

  it('replies with the exception status and body for HttpExceptions', () => {
    const exception = new BadRequestException('bad input');
    const host = makeHost();

    filter.catch(exception, host);

    expect(httpAdapter.reply).toHaveBeenCalledWith(
      expect.anything(),
      exception.getResponse(),
      400,
    );
  });

  it('replies with a generic 500 for unknown errors', () => {
    const exception = new Error('boom');
    const host = makeHost();

    filter.catch(exception, host);

    expect(httpAdapter.reply).toHaveBeenCalledWith(
      expect.anything(),
      {
        statusCode: 500,
        message: 'Internal server error',
      },
      500,
    );
  });

  it('replies with a generic 500 for non-Error throwables', () => {
    const host = makeHost();

    filter.catch('not an error', host);

    expect(httpAdapter.reply).toHaveBeenCalledWith(
      expect.anything(),
      {
        statusCode: 500,
        message: 'Internal server error',
      },
      500,
    );
  });
});
