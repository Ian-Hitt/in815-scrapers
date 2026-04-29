# Create Channel API Documentation

## Endpoint

**GraphQL Mutation:** `createChannel`
**URL:** `POST /graphql`
**Authentication:** Bearer token required
**Content-Type:** `application/json`

## Important Notes

- `slug` must be unique within the realm.
- `is_official` can only be set by users with the `Realm.canManage` permission. It is silently ignored otherwise.
- The authenticated user is automatically added as the channel owner unless `owner_user_id` is provided.

---

## Mutation

```graphql
mutation CreateChannel($channel: CreateChannelData!) {
  createChannel(channel: $channel) {
    channel {
      id
      name
      slug
      kind
      # ... any output fields you need
    }
  }
}
```

---

## Input Fields

### `channel` (required)

#### Required Fields

| Field  | Type      | Rules                                                                          | Description                          |
| ------ | --------- | ------------------------------------------------------------------------------ | ------------------------------------ |
| `name` | `String!` | Required, string                                                               | Display name of the channel.         |
| `slug` | `String!` | Required, unique within realm, regex alphanumeric/hyphens, min 3, max 30 chars | URL-safe identifier for the channel. |

#### Optional Fields

| Field                                    | Type              | Description                                                                                                  |
| ---------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `kind`                                   | `ChannelKindEnum` | Type of channel. Defaults to `default`.                                                                      |
| `tagline`                                | `String`          | Short tagline for the channel.                                                                               |
| `description`                            | `String`          | Text-only description.                                                                                       |
| `page_content`                           | `String`          | JSON content for the page editor.                                                                            |
| `is_mature`                              | `Boolean`         | Whether streams for this channel are marked as mature. Can be overridden at the stream level.                |
| `is_official`                            | `Boolean`         | Whether this is an official channel. **Requires `Realm.canManage` permission** — silently ignored otherwise. |
| `enable_channel_page_content_on_streams` | `Boolean`         | Whether channel page content is shown on stream pages.                                                       |

#### Branding / Colors (all optional)

Accepts `rgb(r, g, b)`, `rgba(r, g, b, a)`, or hex (`#rrggbb`) values.

| Field             | Type     | Description            |
| ----------------- | -------- | ---------------------- |
| `primary_color`   | `String` | Primary brand color.   |
| `secondary_color` | `String` | Secondary brand color. |
| `tertiary_color`  | `String` | Tertiary brand color.  |

#### Rules (optional)

An array of rule objects displayed on the channel page.

| Field   | Type                 | Description            |
| ------- | -------------------- | ---------------------- |
| `rules` | `[ChannelRuleInput]` | List of channel rules. |

Each rule object:

| Field         | Type      | Description                  |
| ------------- | --------- | ---------------------------- |
| `name`        | `String!` | Rule title (required).       |
| `description` | `String`  | Rule description (optional). |

#### Call-to-Action (optional)

| Field      | Type                  | Description                                                                 |
| ---------- | --------------------- | --------------------------------------------------------------------------- |
| `cta_type` | `ChannelCTATypeEnum`  | The type of CTA to display. Defaults to `default` (inherits realm setting). |
| `cta_data` | `ChannelCTADataInput` | CTA configuration data.                                                     |

`cta_data` object:

| Field  | Type     | Description               |
| ------ | -------- | ------------------------- |
| `name` | `String` | Label for the CTA button. |
| `url`  | `String` | URL the CTA links to.     |

#### Draft/Publishing Fields (all optional)

| Field        | Type             | Description                                                 |
| ------------ | ---------------- | ----------------------------------------------------------- |
| `draftState` | `DraftStateEnum` | `published` (default) or `draft`.                           |
| `publish_at` | `Timestamp`      | Schedule publication for a future date. ISO 8601 timestamp. |

#### Tags & Categories (all optional)

| Field                  | Type       | Description                                                         |
| ---------------------- | ---------- | ------------------------------------------------------------------- |
| `tags`                 | `[String]` | Tag names. Only letters, numbers, and spaces allowed.               |
| `channel_category_ids` | `[ID!]`    | Array of category IDs. Must be valid category IDs within the realm. |

#### Uploads (optional)

| Field            | Type     | Description                             |
| ---------------- | -------- | --------------------------------------- |
| `uploads`        | `Object` | Upload object.                          |
| `uploads.cover`  | `ID`     | Upload ID for the channel cover image.  |
| `uploads.avatar` | `ID`     | Upload ID for the channel avatar image. |

#### Ownership & Access (all optional)

| Field           | Type | Description                                                       |
| --------------- | ---- | ----------------------------------------------------------------- |
| `owner_user_id` | `ID` | User ID of the channel owner. Defaults to the authenticated user. |

---

## Enum Values

### `ChannelKindEnum`

| Value     | Description          |
| --------- | -------------------- |
| `default` | A standard channel.  |
| `room`    | A room-type channel. |

### `ChannelCTATypeEnum`

| Value       | Description                                     |
| ----------- | ----------------------------------------------- |
| `default`   | Inherits the realm's default CTA configuration. |
| `custom`    | Custom URL and label.                           |
| `book`      | Booking CTA.                                    |
| `subscribe` | Subscription CTA.                               |
| `donate`    | Donation CTA.                                   |
| `follow`    | Follow CTA.                                     |

### `DraftStateEnum`

| Value       | Description                                 |
| ----------- | ------------------------------------------- |
| `published` | Channel is immediately published (default). |
| `draft`     | Channel is saved as a draft.                |

---

## Example Mutations

### Minimal — Create a basic channel

```graphql
mutation {
  createChannel(channel: { name: "My Channel", slug: "my-channel" }) {
    channel {
      id
      name
      slug
      kind
    }
  }
}
```

### Full — Create a branded channel with CTA and rules

```graphql
mutation {
  createChannel(
    channel: {
      name: "Developer Hub"
      slug: "developer-hub"
      kind: default
      tagline: "Where developers connect."
      description: "A community channel for developers."
      is_mature: false
      primary_color: "#4f46e5"
      secondary_color: "#818cf8"
      rules: [
        {
          name: "Be respectful"
          description: "Treat others as you'd like to be treated."
        }
        { name: "No spam" }
      ]
      cta_type: custom
      cta_data: { name: "Join the Community", url: "https://example.com/join" }
      tags: ["developers", "tech"]
      channel_category_ids: ["123"]
      draftState: published
      owner_user_id: "456"
    }
  ) {
    channel {
      id
      name
      slug
      kind
      cta_type
      cta_data {
        name
        url
      }
    }
  }
}
```

---

## Error Handling

The API returns GraphQL errors in the standard format:

```json
{
  "errors": [
    {
      "message": "Validation failed",
      "extensions": {
        "validation": {
          "channel.slug": ["The channel.slug field is required."]
        }
      }
    }
  ]
}
```

Common error scenarios:

- **Missing required fields:** `name` or `slug` not provided.
- **Duplicate slug:** The slug is already in use within the realm.
- **Invalid slug format:** Slug doesn't meet the alphanumeric/hyphen, 3–30 character requirement.
- **Invalid color format:** Color values must be valid `rgb()`, `rgba()`, or hex strings.
- **Owner not found:** The specified `owner_user_id` does not exist.
- **Permission error:** User lacks permission to create channels in the realm.
