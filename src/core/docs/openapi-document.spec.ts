import { buildOpenApiDocument } from './openapi-document';

describe('buildOpenApiDocument', () => {
  const document = buildOpenApiDocument();

  it('builds a document with the expected top-level shape', () => {
    expect(document.openapi).toBe('3.1.0');
    expect(document.components.securitySchemes.cookieAuth).toEqual({
      type: 'apiKey',
      in: 'cookie',
      name: 'access_token',
    });
  });

  it('includes every controller route', () => {
    expect(document.paths['/auth/register'].post).toBeDefined();
    expect(document.paths['/users/{userId}'].patch).toBeDefined();
    expect(document.paths['/admin/rbac/grants/{grantId}'].delete).toBeDefined();
    expect(document.paths['/api/convert'].post).toBeDefined();
    expect(document.paths['/api/images/convert'].post).toBeDefined();
    expect(document.paths['/api/transformations/history'].get).toBeDefined();
    expect(document.paths['/health'].get).toBeDefined();
  });

  it('does not mark defaulted query params as required', () => {
    const params = document.paths['/users'].get.parameters;
    const limitParam = params.find((param) => param.name === 'limit');

    expect(limitParam?.required).toBe(false);
    expect(limitParam?.schema).toMatchObject({ default: 20 });
  });

  it('marks required body fields from a schema with no defaults', () => {
    const body = document.paths['/auth/register'].post.requestBody;
    const schema = body.content['application/json'].schema as {
      required: string[];
    };

    expect(schema.required.sort()).toEqual(['email', 'password']);
  });
});
