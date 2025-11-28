# Database Setup Checklist

## Required Database Changes

**Expected columns:**

```
id                  | bigint           | NO
user_id             | uuid             | YES (or whatever type you use)
image_url           | text             | YES
description         | text             | YES (NEW)
category            | character varying| YES
style               | character varying| YES
season              | character varying| YES
colors              | jsonb            | YES
tags                | jsonb            | YES
embedding           | vector(512)      | YES (CHANGED)
status              | character varying| YES (CHANGED)
created_at          | timestamp        | YES
updated_at          | timestamp        | YES
```
