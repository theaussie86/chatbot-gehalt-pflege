import {
  z,
  ZodType,
  ZodObject,
  ZodString,
  ZodNumber,
  ZodBoolean,
  ZodEnum,
  ZodOptional,
  ZodDefault,
  ZodLiteral,
  ZodUnion,
} from 'zod';

type GeminiPropertyType =
  | 'STRING'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'INTEGER'
  | 'OBJECT'
  | 'ARRAY';

interface GeminiProperty {
  type: GeminiPropertyType;
  description?: string;
  enum?: string[];
}

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'OBJECT';
    properties: Record<string, GeminiProperty>;
    required: string[];
  };
}

/**
 * Convert a Zod schema to Gemini function calling format
 *
 * Supports: string, number, boolean, enum, literal unions, optional, default
 * German descriptions from .describe() are preserved
 */
export function zodToGeminiTool(
  name: string,
  description: string,
  schema: ZodObject<z.ZodRawShape>
): { functionDeclarations: GeminiFunctionDeclaration[] } {
  const shape = schema.shape;
  const properties: Record<string, GeminiProperty> = {};
  const required: string[] = [];

  for (const [key, zodType] of Object.entries(shape)) {
    const { property, isRequired } = convertZodType(key, zodType as ZodType);
    properties[key] = property;
    if (isRequired) {
      required.push(key);
    }
  }

  return {
    functionDeclarations: [
      {
        name,
        description,
        parameters: {
          type: 'OBJECT',
          properties,
          required,
        },
      },
    ],
  };
}

function convertZodType(
  key: string,
  zodType: ZodType
): { property: GeminiProperty; isRequired: boolean } {
  let innerType = zodType;
  let isRequired = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let description = (zodType as any)._def?.description as string | undefined;

  // Unwrap ZodOptional
  if (zodType instanceof ZodOptional) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    innerType = (zodType as any)._def.innerType;
    isRequired = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    description = description || ((innerType as any)._def?.description as string | undefined);
  }

  // Unwrap ZodDefault
  if (innerType instanceof ZodDefault) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    innerType = (innerType as any)._def.innerType;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    description = description || ((innerType as any)._def?.description as string | undefined);
  }

  const property: GeminiProperty = { type: 'STRING' };
  if (description) {
    property.description = description;
  }

  // Handle ZodEnum
  if (innerType instanceof ZodEnum) {
    property.type = 'STRING';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    property.enum = (innerType as any)._def.values as string[];
    return { property, isRequired };
  }

  // Handle ZodUnion of literals (e.g., taxClass: 1|2|3|4|5|6)
  if (innerType instanceof ZodUnion) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options = (innerType as any)._def.options as ZodType[];
    if (options.every((opt) => opt instanceof ZodLiteral)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const values = options.map((opt) => (opt as any)._def.value as unknown);
      // Check if all literals are numbers
      if (values.every((v: unknown) => typeof v === 'number')) {
        property.type = 'NUMBER';
        property.enum = values.map((v) => String(v));
      } else {
        property.type = 'STRING';
        property.enum = values.map(String);
      }
      return { property, isRequired };
    }
  }

  // Handle ZodString
  if (innerType instanceof ZodString) {
    property.type = 'STRING';
    return { property, isRequired };
  }

  // Handle ZodNumber
  if (innerType instanceof ZodNumber) {
    // Check if it's an integer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const checks = ((innerType as any)._def.checks || []) as Array<{ kind: string }>;
    const isInt = checks.some((c) => c.kind === 'int');
    property.type = isInt ? 'INTEGER' : 'NUMBER';
    return { property, isRequired };
  }

  // Handle ZodBoolean
  if (innerType instanceof ZodBoolean) {
    property.type = 'BOOLEAN';
    return { property, isRequired };
  }

  // Handle ZodLiteral (single value)
  if (innerType instanceof ZodLiteral) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (innerType as any)._def.value as unknown;
    if (typeof value === 'number') {
      property.type = 'NUMBER';
    } else if (typeof value === 'boolean') {
      property.type = 'BOOLEAN';
    } else {
      property.type = 'STRING';
    }
    return { property, isRequired };
  }

  // Default to STRING
  return { property, isRequired };
}

/**
 * Merge multiple tool declarations into a single tools object
 */
export function mergeTools(
  ...tools: { functionDeclarations: GeminiFunctionDeclaration[] }[]
): { functionDeclarations: GeminiFunctionDeclaration[] } {
  return {
    functionDeclarations: tools.flatMap((t) => t.functionDeclarations),
  };
}
