import { HttpException, RequestTimeoutException } from '@nestjs/common';

jest.mock('node:worker_threads', () => ({ Worker: jest.fn() }));

import { Worker } from 'node:worker_threads';

import { WorkerConversionService } from './worker-conversion.service';

describe('WorkerConversionService', () => {
  let config: { get: jest.Mock };
  let service: WorkerConversionService;
  let listeners: Record<string, (arg: unknown) => void>;
  let postMessage: jest.Mock;
  let terminate: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    listeners = {};
    postMessage = jest.fn();
    terminate = jest.fn();

    (Worker as unknown as jest.Mock).mockImplementation(() => ({
      once: (event: string, cb: (arg: unknown) => void) => {
        listeners[event] = cb;
      },
      postMessage,
      terminate,
    }));

    config = { get: jest.fn().mockReturnValue(30) };
    service = new WorkerConversionService(config as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves with the output buffer on success', async () => {
    const promise = service.convert('csv', 'json', Buffer.from('in'));
    listeners.message({ ok: true, output: Buffer.from('out') });

    await expect(promise).resolves.toEqual(Buffer.from('out'));
    expect(terminate).toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({
      sourceFormat: 'csv',
      targetFormat: 'json',
      buffer: Buffer.from('in'),
    });
  });

  it('rejects with an HttpException carrying the worker status/message/name', async () => {
    const promise = service.convert('csv', 'json', Buffer.from('in'));
    listeners.message({
      ok: false,
      status: 400,
      name: 'BadRequestException',
      message: 'bad input',
    });

    await expect(promise).rejects.toThrow('bad input');

    try {
      await promise;
      throw new Error('expected promise to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(400);
      expect((error as { errorCode?: string }).errorCode).toBe(
        'BadRequestException',
      );
    }
  });

  it('rejects with RequestTimeoutException and terminates the worker after the timeout', async () => {
    const promise = service.convert('csv', 'json', Buffer.from('in'));
    const assertion = expect(promise).rejects.toBeInstanceOf(
      RequestTimeoutException,
    );

    jest.advanceTimersByTime(30_000);

    await assertion;
    expect(terminate).toHaveBeenCalled();
  });

  it('rejects when the worker emits an error event', async () => {
    const promise = service.convert('csv', 'json', Buffer.from('in'));
    listeners.error(new Error('worker crashed'));

    await expect(promise).rejects.toThrow('worker crashed');
  });
});
