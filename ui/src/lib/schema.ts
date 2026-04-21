import type { SchemaField, SchemaObject } from '../types'

export function extractSchemaFields(schema: unknown): SchemaField[] {
  const objectSchema = toSchemaObject(schema)
  if (!objectSchema?.properties) {
    return []
  }

  const required = new Set(objectSchema.required ?? [])

  return Object.entries(objectSchema.properties).map(([name, property]) => ({
    name,
    type: property.type ?? 'unknown',
    description: property.description ?? 'No description provided.',
    required: required.has(name),
  }))
}

export function formatJSON(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? ''
}

function toSchemaObject(schema: unknown): SchemaObject | null {
  if (!isRecord(schema)) {
    return null
  }

  const propertiesValue = schema.properties
  let properties: Record<string, SchemaObject> | undefined

  if (isRecord(propertiesValue)) {
    properties = Object.fromEntries(
      Object.entries(propertiesValue).map(([key, value]) => [key, toSchemaObject(value) ?? {}]),
    )
  }

  const requiredValue = Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === 'string')
    : undefined

  return {
    type: typeof schema.type === 'string' ? schema.type : undefined,
    description: typeof schema.description === 'string' ? schema.description : undefined,
    properties,
    required: requiredValue,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
