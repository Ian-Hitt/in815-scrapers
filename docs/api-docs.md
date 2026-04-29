# Create Event API Documentation

## Endpoint

**GraphQL Mutation:** `createEvent`
**URL:** `POST /graphql`
**Authentication:** Bearer token required
**Content-Type:** `application/json`

## Important Notes

- The `kind` value `stream` is **not allowed** in this mutation. Use `createStream` instead.
- `channel_id`, `room_id`, `lesson_course_id`, and `kind` are **immutable** after creation — they cannot be changed via the update mutation.
- If `room_id` is provided, the event becomes a child of that room's parent event. If no `room_id` is provided, a default room is automatically created for the event.
- If `room_id` or `lesson_course_id` is provided without a `channel_id`, the channel is automatically inherited from the room/course.

---

## Mutation

```graphql
mutation CreateEvent(
  $event: CreateEventInput!
  $schedule: CreateEventScheduleInput
) {
  createEvent(event: $event, schedule: $schedule) {
    event {
      id
      name
      kind
      state
      # ... any output fields you need
    }
  }
}
```

---

## Input Fields

### `event` (required)

#### Required Fields

| Field  | Type             | Description                                               |
| ------ | ---------------- | --------------------------------------------------------- |
| `name` | `String!`        | Name of the event.                                        |
| `kind` | `EventKindEnum!` | Type of event. See enum values below. Cannot be `stream`. |

Plus **one of** these parent associations (exactly one is required):

| Field              | Type | Description                                                                                                                     |
| ------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------- |
| `channel_id`       | `ID` | Associates the event with a channel. Required if `room_id` and `lesson_course_id` are not provided.                             |
| `room_id`          | `ID` | Creates the event as a child event inside the specified room. Required if `channel_id` and `lesson_course_id` are not provided. |
| `lesson_course_id` | `ID` | Creates the event as a child event inside the specified lesson course. Required if `channel_id` and `room_id` are not provided. |

#### Optional Fields

| Field                  | Type      | Description                                                                                                                                        |
| ---------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `external_url`         | `String`  | External URL associated with the event.                                                                                                            |
| `description`          | `String`  | Text-only description of the event.                                                                                                                |
| `page_content`         | `String`  | JSON content for the page editor.                                                                                                                  |
| `schedule_description` | `String`  | Human-readable schedule description text.                                                                                                          |
| `is_in_person`         | `Boolean` | Whether this is an in-person event.                                                                                                                |
| `publish_recursively`  | `Boolean` | If true, when this event is auto-published at its scheduled date, all children will also be published. Only works with `container_generic` events. |

#### Address Fields (all optional)

| Field                 | Type     | Description                         |
| --------------------- | -------- | ----------------------------------- |
| `address_description` | `String` | Venue/location name or description. |
| `address_line1`       | `String` | Street address line 1.              |
| `address_line2`       | `String` | Street address line 2.              |
| `address_city`        | `String` | City.                               |
| `address_state`       | `String` | State/province.                     |
| `address_postal_code` | `String` | Postal/ZIP code.                    |
| `address_country`     | `String` | Country.                            |

#### Registration Fields (all optional)

| Field                             | Type        | Rules                    | Description                                   |
| --------------------------------- | ----------- | ------------------------ | --------------------------------------------- |
| `show_registration_email_field`   | `Boolean`   |                          | Show email field on registration form.        |
| `show_registration_name_field`    | `Boolean`   |                          | Show name field on registration form.         |
| `show_registration_address_field` | `Boolean`   |                          | Show address field on registration form.      |
| `show_registration_phone_field`   | `Boolean`   |                          | Show phone field on registration form.        |
| `show_registration_age_field`     | `Boolean`   |                          | Show age field on registration form.          |
| `show_registration_sex_field`     | `Boolean`   |                          | Show sex field on registration form.          |
| `register_url`                    | `String`    | Valid URL, max 250 chars | URL for external registration.                |
| `is_external_registration`        | `Boolean`   |                          | Whether registration is handled externally.   |
| `register_cta_text`               | `String`    | Max 20 chars             | Custom text for the registration button.      |
| `registration_ends_at`            | `Timestamp` |                          | When registration closes. ISO 8601 timestamp. |

#### Draft/Publishing Fields (all optional)

| Field        | Type             | Description                                                 |
| ------------ | ---------------- | ----------------------------------------------------------- |
| `draftState` | `DraftStateEnum` | `published` (default) or `draft`.                           |
| `publish_at` | `Timestamp`      | Schedule publication for a future date. ISO 8601 timestamp. |

#### Tags & Categories (all optional)

| Field                | Type       | Description                                                         |
| -------------------- | ---------- | ------------------------------------------------------------------- |
| `tags`               | `[String]` | Tag names. Only letters, numbers, and spaces allowed.               |
| `event_category_ids` | `[ID!]`    | Array of category IDs. Must be valid category IDs within the realm. |

#### Content Attachments (optional)

| Field      | Type              | Description                                      |
| ---------- | ----------------- | ------------------------------------------------ |
| `contents` | `[EventContents]` | Array of content objects to attach to the event. |

Each `EventContents` object:

| Field          | Type                    | Description                               |
| -------------- | ----------------------- | ----------------------------------------- |
| `content_type` | `EventContentTypeEnum!` | One of: `Event`, `Stream`, `Appointment`. |
| `content_id`   | `ID!`                   | The ID of the content to attach.          |

#### Uploads (optional)

| Field           | Type     | Description                          |
| --------------- | -------- | ------------------------------------ |
| `uploads`       | `Object` | Upload object.                       |
| `uploads.cover` | `ID`     | Upload ID for the event cover image. |

#### Ownership & Access (all optional)

| Field           | Type | Description                                                     |
| --------------- | ---- | --------------------------------------------------------------- |
| `owner_user_id` | `ID` | User ID of the event owner. Defaults to the authenticated user. |

---

### `schedule` (optional but recommended)

| Field        | Type              | Description                           |
| ------------ | ----------------- | ------------------------------------- |
| `start_at`   | `Timestamp!`      | Event start time. ISO 8601 timestamp. |
| `duration`   | `Int!`            | Duration in seconds. Minimum: `0`.    |
| `recurrence` | `RecurrenceInput` | Recurrence configuration (optional).  |

#### Recurrence Object (optional)

| Field              | Type          | Description                                           |
| ------------------ | ------------- | ----------------------------------------------------- |
| `recurrence_rules` | `[RRule]`     | Array of recurrence rule objects (iCal RRULE format). |
| `exclusion_rules`  | `[ExRule]`    | Array of exclusion rule objects.                      |
| `dates`            | `[Timestamp]` | Additional specific dates to include.                 |
| `exclusion_dates`  | `[Timestamp]` | Specific dates to exclude.                            |

---

## Enum Values

### `EventKindEnum`

| Value                   | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| `appointment`           | A single appointment event.                           |
| `container_generic`     | A container that holds child events (generic).        |
| `container_appointment` | A container that holds appointment-type child events. |
| `event`                 | A standard event.                                     |
| `break`                 | A break/intermission.                                 |
| `classroom`             | A classroom event.                                    |
| `meeting`               | A meeting event.                                      |
| `external_url`          | An event linking to an external URL.                  |

> `stream` exists as a kind but **cannot** be used with `createEvent`. Use `createStream` instead.

### `DraftStateEnum`

| Value       | Description                               |
| ----------- | ----------------------------------------- |
| `published` | Event is immediately published (default). |
| `draft`     | Event is saved as a draft.                |

### `EventContentTypeEnum`

| Value         |
| ------------- |
| `Event`       |
| `Stream`      |
| `Appointment` |

---

## Example Mutation

### Minimal — Create a basic event

```graphql
mutation {
  createEvent(
    event: { name: "Weekly Team Sync", kind: event, channel_id: "123" }
    schedule: { start_at: "2026-04-01T14:00:00Z", duration: 3600 }
  ) {
    event {
      id
      name
      kind
      state
    }
  }
}
```

### Full — Create an in-person event with registration

```graphql
mutation {
  createEvent(
    event: {
      name: "Annual Developer Conference"
      kind: container_generic
      channel_id: "123"
      description: "Our yearly developer meetup."
      page_content: "{\"blocks\": []}"
      is_in_person: true
      address_description: "Convention Center"
      address_line1: "123 Main St"
      address_city: "San Francisco"
      address_state: "CA"
      address_postal_code: "94102"
      address_country: "US"
      show_registration_email_field: true
      show_registration_name_field: true
      register_cta_text: "Register Now"
      registration_ends_at: "2026-03-30T23:59:59Z"
      tags: ["conference", "developers"]
      event_category_ids: ["456"]
      draftState: published
      publish_recursively: true
      owner_user_id: "789"
    }
    schedule: { start_at: "2026-04-01T09:00:00Z", duration: 28800 }
  ) {
    event {
      id
      name
      kind
      state
      is_in_person
      schedule {
        start_at
        duration
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
          "event.name": ["The event.name field is required."]
        }
      }
    }
  ]
}
```

Common error scenarios:

- **Missing required fields:** `name`, `kind`, or one of `channel_id`/`room_id`/`lesson_course_id` not provided.
- **Invalid kind:** Using `stream` as the kind value returns: `"This mutation cannot be used to create single-stream events. Please use createStream instead."`
- **Permission error:** User lacks permission to create events in the specified channel/room.
- **Mismatched channel:** Providing both `room_id` and `channel_id` where the room belongs to a different channel.
