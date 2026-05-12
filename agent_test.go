package main

import "testing"

func TestSanitizeOpenAIParametersSchemaAddsMissingArrayItems(t *testing.T) {
	t.Parallel()

	input := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"step": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"request": map[string]any{
						"type": "object",
						"properties": map[string]any{
							"body": map[string]any{
								"anyOf": []any{
									map[string]any{"type": "string"},
									map[string]any{"type": "null"},
									map[string]any{"type": "array"},
								},
							},
						},
					},
				},
			},
		},
	}

	sanitized := sanitizeOpenAIParametersSchema(input)

	properties := sanitized["properties"].(map[string]any)
	step := properties["step"].(map[string]any)
	request := step["properties"].(map[string]any)["request"].(map[string]any)
	body := request["properties"].(map[string]any)["body"].(map[string]any)
	anyOf := body["anyOf"].([]any)
	arrayVariant := anyOf[2].(map[string]any)

	if arrayVariant["type"] != "array" {
		t.Fatalf("expected array variant, got %#v", arrayVariant["type"])
	}

	items, ok := arrayVariant["items"].(map[string]any)
	if !ok {
		t.Fatalf("expected array variant items to be an object, got %T", arrayVariant["items"])
	}
	if len(items) != 0 {
		t.Fatalf("expected default empty items schema, got %#v", items)
	}
}

func TestSanitizeOpenAIParametersSchemaDefaultsToObject(t *testing.T) {
	t.Parallel()

	sanitized := sanitizeOpenAIParametersSchema(nil)

	if sanitized["type"] != "object" {
		t.Fatalf("expected object schema, got %#v", sanitized["type"])
	}

	properties, ok := sanitized["properties"].(map[string]any)
	if !ok {
		t.Fatalf("expected properties object, got %T", sanitized["properties"])
	}
	if len(properties) != 0 {
		t.Fatalf("expected empty properties, got %#v", properties)
	}
}
