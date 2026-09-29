import { z } from 'zod';

import {
  confirmChallengeLinkSchema,
  confirmChallengeOtpSchema,
} from '@/core/challenge/dto/confirm-challenge.dto';
import { loginSchema } from '@/modules/auth/dto/login.dto';
import { registerSchema } from '@/modules/auth/dto/register.dto';
import {
  targetImageFormatSchema,
  qualitySchema,
  dimensionSchema,
  backgroundSchema,
} from '@/modules/image-transformation/dto/convert-image.dto';
import {
  createGrantSchema,
  updateGrantSchema,
} from '@/modules/rbac/dto/grant.dto';
import {
  createPermissionSchema,
  updatePermissionSchema,
} from '@/modules/rbac/dto/permission.dto';
import {
  createRoleSchema,
  updateRoleSchema,
} from '@/modules/rbac/dto/role.dto';
import { targetFormatSchema } from '@/modules/transformation/dto/convert.dto';
import { listHistoryQuerySchema } from '@/modules/transformation-history/dto/list-history.dto';
import { initiateEmailChangeSchema } from '@/modules/users/dto/initiate-email-change.dto';
import { listUsersQuerySchema } from '@/modules/users/dto/list-users.dto';
import { updateUserSchema } from '@/modules/users/dto/update-user.dto';

type JsonSchema = Record<string, unknown>;

function toJsonSchema(schema: z.ZodType): JsonSchema {
  const json = z.toJSONSchema(schema) as JsonSchema & {
    properties?: Record<string, JsonSchema>;
    required?: string[];
  };

  // A defaulted field is optional on the wire (Zod fills it server-side),
  // but z.toJSONSchema() still lists it in `required` from a parse-input
  // point of view. Strip those so OpenAPI doesn't call them mandatory.
  if (json.required && json.properties) {
    const properties = json.properties;
    json.required = json.required.filter(
      (key) => !('default' in (properties[key] ?? {})),
    );
  }

  return json;
}

function jsonBody(schema: z.ZodType, description: string) {
  return {
    description,
    required: true,
    content: { 'application/json': { schema: toJsonSchema(schema) } },
  };
}

function queryParams(schema: z.ZodType) {
  const json = toJsonSchema(schema) as {
    properties?: Record<string, JsonSchema>;
    required?: string[];
  };
  const required = new Set(json.required ?? []);

  return Object.entries(json.properties ?? {}).map(([name, paramSchema]) => ({
    name,
    in: 'query',
    required: required.has(name),
    schema: paramSchema,
  }));
}

function pathParam(name: string, description: string) {
  return {
    name,
    in: 'path',
    required: true,
    description,
    schema: { type: 'string' },
  };
}

const AUTH = [{ cookieAuth: [] as string[] }];

interface ResponseOpts {
  forbidden?: boolean;
  notFound?: boolean;
  conflict?: boolean;
  validation?: boolean;
}

function responses(
  successCode: string,
  successDescription: string,
  opts: ResponseOpts = {},
) {
  const out: Record<string, { description: string }> = {
    [successCode]: { description: successDescription },
  };
  if (opts.validation !== false) {
    out['400'] = { description: 'Validation error' };
  }
  if (opts.forbidden) {
    out['401'] = { description: 'Unauthorized' };
    out['403'] = { description: 'Forbidden' };
  }
  if (opts.notFound) {
    out['404'] = { description: 'Not found' };
  }
  if (opts.conflict) {
    out['409'] = { description: 'Conflict' };
  }
  return out;
}

const multipartConvertFileBody = {
  description: 'Multipart file upload',
  required: true,
  content: {
    'multipart/form-data': {
      schema: {
        type: 'object',
        properties: {
          file: { type: 'string', format: 'binary' },
          targetFormat: toJsonSchema(targetFormatSchema),
          save: { type: 'string', enum: ['true', 'false'] },
        },
        required: ['file', 'targetFormat'],
      },
    },
  },
};

const multipartConvertImageBody = {
  description: 'Multipart image upload',
  required: true,
  content: {
    'multipart/form-data': {
      schema: {
        type: 'object',
        properties: {
          file: { type: 'string', format: 'binary' },
          targetFormat: toJsonSchema(targetImageFormatSchema),
          quality: toJsonSchema(qualitySchema),
          width: toJsonSchema(dimensionSchema),
          height: toJsonSchema(dimensionSchema),
          background: toJsonSchema(backgroundSchema),
          save: { type: 'string', enum: ['true', 'false'] },
        },
        required: ['file', 'targetFormat'],
      },
    },
  },
};

export function buildOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'NestJS Monolith Boilerplate API',
      description:
        'Reference for every registered route, generated from the Zod schemas already used for request validation.',
      version: '1.0',
    },
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'access_token',
        },
      },
    },
    tags: [
      { name: 'auth' },
      { name: 'users' },
      { name: 'rbac' },
      { name: 'transformation' },
      { name: 'images' },
      { name: 'history' },
      { name: 'health' },
    ],
    paths: {
      '/auth/register': {
        post: {
          tags: ['auth'],
          summary: 'Register with email + password',
          requestBody: jsonBody(registerSchema, 'Registration input'),
          responses: responses('201', 'User created', { conflict: true }),
        },
      },
      '/auth/register/confirm': {
        post: {
          tags: ['auth'],
          summary: 'Confirm registration via OTP',
          requestBody: jsonBody(confirmChallengeOtpSchema, 'OTP confirmation'),
          responses: responses('200', 'Registration confirmed'),
        },
        get: {
          tags: ['auth'],
          summary: 'Confirm registration via magic link',
          parameters: queryParams(confirmChallengeLinkSchema),
          responses: responses('200', 'Registration confirmed'),
        },
      },
      '/auth/login': {
        post: {
          tags: ['auth'],
          summary: 'Log in with email + password',
          requestBody: jsonBody(loginSchema, 'Login input'),
          responses: responses('200', 'Logged in or confirmation required'),
        },
      },
      '/auth/login/confirm': {
        post: {
          tags: ['auth'],
          summary: 'Confirm login via OTP',
          requestBody: jsonBody(confirmChallengeOtpSchema, 'OTP confirmation'),
          responses: responses('200', 'Login confirmed'),
        },
        get: {
          tags: ['auth'],
          summary: 'Confirm login via magic link',
          parameters: queryParams(confirmChallengeLinkSchema),
          responses: responses('200', 'Login confirmed'),
        },
      },
      '/auth/refresh': {
        post: {
          tags: ['auth'],
          summary: 'Rotate the access/refresh token pair',
          responses: responses('200', 'New tokens issued', { forbidden: true }),
        },
      },
      '/auth/logout': {
        post: {
          tags: ['auth'],
          summary: 'Clear auth cookies',
          responses: responses('200', 'Logged out'),
        },
      },
      '/auth/me': {
        get: {
          tags: ['auth'],
          summary: 'Get the current session identity',
          security: AUTH,
          responses: responses('200', 'Current user', { forbidden: true }),
        },
      },
      '/users': {
        get: {
          tags: ['users'],
          summary: 'List users (admin)',
          security: AUTH,
          parameters: queryParams(listUsersQuerySchema),
          responses: responses('200', 'Paginated user list', {
            forbidden: true,
          }),
        },
      },
      '/users/{userId}': {
        get: {
          tags: ['users'],
          summary: 'Get a user profile (self or permitted)',
          security: AUTH,
          parameters: [pathParam('userId', 'Target user id')],
          responses: responses('200', 'User profile', {
            forbidden: true,
            notFound: true,
          }),
        },
        patch: {
          tags: ['users'],
          summary: 'Update a user profile (self or admin)',
          security: AUTH,
          parameters: [pathParam('userId', 'Target user id')],
          requestBody: jsonBody(updateUserSchema, 'Fields to update'),
          responses: responses('200', 'Updated profile', {
            forbidden: true,
            notFound: true,
            conflict: true,
          }),
        },
        delete: {
          tags: ['users'],
          summary:
            'Delete a user (self starts a confirmation challenge, admin deletes directly)',
          security: AUTH,
          parameters: [pathParam('userId', 'Target user id')],
          responses: responses(
            '204',
            'Deleted (admin) or confirmation required (self)',
            {
              forbidden: true,
              notFound: true,
            },
          ),
        },
      },
      '/users/{userId}/email-change': {
        post: {
          tags: ['users'],
          summary: 'Initiate a self email change',
          security: AUTH,
          parameters: [pathParam('userId', 'Must match the current user')],
          requestBody: jsonBody(initiateEmailChangeSchema, 'New email address'),
          responses: responses('200', 'Confirmation challenge created', {
            forbidden: true,
            conflict: true,
          }),
        },
      },
      '/users/{userId}/email-change/confirm': {
        post: {
          tags: ['users'],
          summary: 'Confirm an email change via OTP',
          security: AUTH,
          parameters: [pathParam('userId', 'Must match the current user')],
          requestBody: jsonBody(confirmChallengeOtpSchema, 'OTP confirmation'),
          responses: responses('200', 'Email changed', { forbidden: true }),
        },
        get: {
          tags: ['users'],
          summary: 'Confirm an email change via magic link',
          security: AUTH,
          parameters: [
            pathParam('userId', 'Must match the current user'),
            ...queryParams(confirmChallengeLinkSchema),
          ],
          responses: responses('200', 'Email changed', { forbidden: true }),
        },
      },
      '/users/{userId}/delete/confirm': {
        post: {
          tags: ['users'],
          summary: 'Confirm self-deletion via OTP',
          security: AUTH,
          parameters: [pathParam('userId', 'Must match the current user')],
          requestBody: jsonBody(confirmChallengeOtpSchema, 'OTP confirmation'),
          responses: responses('200', 'Account deleted', { forbidden: true }),
        },
        get: {
          tags: ['users'],
          summary: 'Confirm self-deletion via magic link',
          security: AUTH,
          parameters: [
            pathParam('userId', 'Must match the current user'),
            ...queryParams(confirmChallengeLinkSchema),
          ],
          responses: responses('200', 'Account deleted', { forbidden: true }),
        },
      },
      '/admin/rbac/roles': {
        get: {
          tags: ['rbac'],
          summary: 'List roles',
          security: AUTH,
          responses: responses('200', 'Roles', { forbidden: true }),
        },
        post: {
          tags: ['rbac'],
          summary: 'Create a role',
          security: AUTH,
          requestBody: jsonBody(createRoleSchema, 'New role'),
          responses: responses('201', 'Role created', {
            forbidden: true,
            conflict: true,
          }),
        },
      },
      '/admin/rbac/roles/{roleId}': {
        put: {
          tags: ['rbac'],
          summary: 'Update a role',
          security: AUTH,
          parameters: [pathParam('roleId', 'Role id')],
          requestBody: jsonBody(updateRoleSchema, 'Role fields to update'),
          responses: responses('200', 'Role updated', {
            forbidden: true,
            notFound: true,
            conflict: true,
          }),
        },
        delete: {
          tags: ['rbac'],
          summary: 'Delete a role',
          security: AUTH,
          parameters: [pathParam('roleId', 'Role id')],
          responses: responses('204', 'Role deleted', {
            forbidden: true,
            notFound: true,
            conflict: true,
          }),
        },
      },
      '/admin/rbac/permissions': {
        get: {
          tags: ['rbac'],
          summary: 'List permissions',
          security: AUTH,
          responses: responses('200', 'Permissions', { forbidden: true }),
        },
        post: {
          tags: ['rbac'],
          summary: 'Create a permission',
          security: AUTH,
          requestBody: jsonBody(createPermissionSchema, 'New permission'),
          responses: responses('201', 'Permission created', {
            forbidden: true,
            conflict: true,
          }),
        },
      },
      '/admin/rbac/permissions/{permissionId}': {
        put: {
          tags: ['rbac'],
          summary: 'Update a permission',
          security: AUTH,
          parameters: [pathParam('permissionId', 'Permission id')],
          requestBody: jsonBody(
            updatePermissionSchema,
            'Permission fields to update',
          ),
          responses: responses('200', 'Permission updated', {
            forbidden: true,
            notFound: true,
            conflict: true,
          }),
        },
        delete: {
          tags: ['rbac'],
          summary: 'Delete a permission',
          security: AUTH,
          parameters: [pathParam('permissionId', 'Permission id')],
          responses: responses('204', 'Permission deleted', {
            forbidden: true,
            notFound: true,
            conflict: true,
          }),
        },
      },
      '/admin/rbac/grants': {
        get: {
          tags: ['rbac'],
          summary: 'List grants',
          security: AUTH,
          responses: responses('200', 'Grants', { forbidden: true }),
        },
        post: {
          tags: ['rbac'],
          summary: 'Create a grant',
          security: AUTH,
          requestBody: jsonBody(createGrantSchema, 'New grant'),
          responses: responses('201', 'Grant created', {
            forbidden: true,
            notFound: true,
            conflict: true,
          }),
        },
      },
      '/admin/rbac/grants/{grantId}': {
        put: {
          tags: ['rbac'],
          summary: 'Update a grant',
          security: AUTH,
          parameters: [pathParam('grantId', 'Grant id')],
          requestBody: jsonBody(updateGrantSchema, 'Grant fields to update'),
          responses: responses('200', 'Grant updated', {
            forbidden: true,
            notFound: true,
          }),
        },
        delete: {
          tags: ['rbac'],
          summary: 'Delete a grant',
          security: AUTH,
          parameters: [pathParam('grantId', 'Grant id')],
          responses: responses('204', 'Grant deleted', {
            forbidden: true,
            notFound: true,
          }),
        },
      },
      '/api/convert': {
        post: {
          tags: ['transformation'],
          summary: 'Convert a CSV/JSON/XML/YAML file (runs in a worker thread)',
          security: AUTH,
          requestBody: multipartConvertFileBody,
          responses: responses('200', 'Converted file stream', {
            forbidden: true,
          }),
        },
      },
      '/api/convert/formats': {
        get: {
          tags: ['transformation'],
          summary: 'List supported file conversion directions',
          security: AUTH,
          responses: responses('200', 'Supported directions', {
            forbidden: true,
          }),
        },
      },
      '/api/images/convert': {
        post: {
          tags: ['images'],
          summary: 'Convert a PNG/JPEG/SVG image',
          security: AUTH,
          requestBody: multipartConvertImageBody,
          responses: responses('200', 'Converted image stream', {
            forbidden: true,
          }),
        },
      },
      '/api/images/convert/formats': {
        get: {
          tags: ['images'],
          summary: 'List supported image conversion directions',
          security: AUTH,
          responses: responses('200', 'Supported directions', {
            forbidden: true,
          }),
        },
      },
      '/api/transformations/history': {
        get: {
          tags: ['history'],
          summary:
            "List the caller's (or, with permission, another user's) transformation history",
          security: AUTH,
          parameters: queryParams(listHistoryQuerySchema),
          responses: responses('200', 'Paginated history', {
            forbidden: true,
          }),
        },
      },
      '/api/transformations/history/{itemId}/download': {
        get: {
          tags: ['history'],
          summary: 'Download a saved transformation result',
          security: AUTH,
          parameters: [pathParam('itemId', 'Transformation history record id')],
          responses: responses('200', 'File stream', {
            forbidden: true,
            notFound: true,
            validation: false,
          }),
        },
      },
      '/health': {
        get: {
          tags: ['health'],
          summary: 'Liveness/readiness check (no auth)',
          responses: responses('200', 'Health status', { validation: false }),
        },
      },
    },
  };
}
