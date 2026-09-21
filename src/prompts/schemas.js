function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
}

export const QUALITY_A_SCHEMA = deepFreeze({
    "type": "object",
    "additionalProperties": false,
    "required": [
        "memories"
    ],
    "properties": {
        "memories": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                    "body",
                    "title",
                    "people",
                    "locations",
                    "storyTime",
                    "classificationTags",
                    "specialDateCandidates"
                ],
                "properties": {
                    "body": {
                        "type": "string",
                        "minLength": 1
                    },
                    "title": {
                        "type": "string"
                    },
                    "people": {
                        "type": "array",
                        "items": {
                            "type": "string"
                        }
                    },
                    "locations": {
                        "type": "array",
                        "items": {
                            "type": "string"
                        }
                    },
                    "storyTime": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": [
                            "start",
                            "end"
                        ],
                        "properties": {
                            "start": {
                                "type": "string"
                            },
                            "end": {
                                "type": "string"
                            }
                        }
                    },
                    "classificationTags": {
                        "type": "array",
                        "maxItems": 0,
                        "items": {
                            "type": "string"
                        }
                    },
                    "specialDateCandidates": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": [
                                "name",
                                "storyDate",
                                "reason"
                            ],
                            "properties": {
                                "name": {
                                    "type": "string"
                                },
                                "storyDate": {
                                    "type": "string"
                                },
                                "reason": {
                                    "type": "string"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
});
export const QUALITY_B_SCHEMA = deepFreeze({
    "type": "object",
    "additionalProperties": false,
    "required": [
        "indexes"
    ],
    "properties": {
        "indexes": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                    "draftId",
                    "eventKeywords",
                    "detailKeywords"
                ],
                "properties": {
                    "draftId": {
                        "type": "string",
                        "minLength": 1
                    },
                    "eventKeywords": {
                        "type": "array",
                        "items": {
                            "type": "string"
                        }
                    },
                    "detailKeywords": {
                        "type": "array",
                        "items": {
                            "type": "string"
                        }
                    },
                    "detailAliases": {}
                }
            }
        }
    }
});
export const FAST_SCHEMA = deepFreeze({
    "type": "object",
    "additionalProperties": false,
    "required": [
        "memories"
    ],
    "properties": {
        "memories": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                    "body",
                    "title",
                    "people",
                    "locations",
                    "storyTime",
                    "eventKeywords",
                    "detailKeywords",
                    "classificationTags",
                    "specialDateCandidates"
                ],
                "properties": {
                    "body": {
                        "type": "string",
                        "minLength": 1
                    },
                    "title": {
                        "type": "string"
                    },
                    "people": {
                        "type": "array",
                        "items": {
                            "type": "string"
                        }
                    },
                    "locations": {
                        "type": "array",
                        "items": {
                            "type": "string"
                        }
                    },
                    "storyTime": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": [
                            "start",
                            "end"
                        ],
                        "properties": {
                            "start": {
                                "type": "string"
                            },
                            "end": {
                                "type": "string"
                            }
                        }
                    },
                    "eventKeywords": {
                        "type": "array",
                        "items": {
                            "type": "string"
                        }
                    },
                    "detailKeywords": {
                        "type": "array",
                        "items": {
                            "type": "string"
                        }
                    },
                    "detailAliases": {},
                    "classificationTags": {
                        "type": "array",
                        "maxItems": 0,
                        "items": {
                            "type": "string"
                        }
                    },
                    "specialDateCandidates": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": [
                                "name",
                                "storyDate",
                                "reason"
                            ],
                            "properties": {
                                "name": {
                                    "type": "string"
                                },
                                "storyDate": {
                                    "type": "string"
                                },
                                "reason": {
                                    "type": "string"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
});

const keywordOnlySchema = JSON.parse(JSON.stringify(QUALITY_B_SCHEMA));
delete keywordOnlySchema.properties.indexes.items.properties.detailAliases;
export const QUALITY_KEYWORDS_ONLY_SCHEMA = deepFreeze(keywordOnlySchema);
export const QUALITY_C_SCHEMA = deepFreeze({
    type: 'object', additionalProperties: false, required: ['indexes'],
    properties: { indexes: { type: 'array', minItems: 1, items: {
        type: 'object', additionalProperties: false, required: ['draftId', 'detailAliases'],
        properties: {
            draftId: { type: 'string', minLength: 1 },
            detailAliases: { type: 'array', items: {
                type: 'object', additionalProperties: false, required: ['parentDetail', 'aliases'],
                properties: { parentDetail: { type: 'string', minLength: 1 }, aliases: { type: 'array', minItems: 1, items: { type: 'string' } } },
            } },
        },
    } } },
});
export const MERGE_SCHEMA = deepFreeze({
    type: 'object', additionalProperties: false,
    required: ['title', 'body', 'coherenceWarning'],
    properties: {
        title: { type: 'string', minLength: 1 },
        body: { type: 'string', minLength: 1 },
        coherenceWarning: { type: 'string' },
    },
});

export const PROMPT_SCHEMAS = Object.freeze({
    'schema.quality_a': QUALITY_A_SCHEMA,
    'schema.quality_b': QUALITY_B_SCHEMA,
    'schema.quality_keywords_only': QUALITY_KEYWORDS_ONLY_SCHEMA,
    'schema.quality_c': QUALITY_C_SCHEMA,
    'schema.fast': FAST_SCHEMA,
    'schema.merge': MERGE_SCHEMA,
});
