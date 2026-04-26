# User-Created Challenges — Backend Specification

> Status: Draft | Target: MVP
> Pattern: Spec-Driven Development (SDD) — API contract defined first, then schema, then implementation.

---

## 1. Overview

Extend the existing challenge system to allow **authenticated users** to create their own reading challenges. Users pick from templates (Monthly Sprint, Yearly Goal, etc.), customize parameters, and publish public challenges that others can join.

---

## 2. API Specification

### 2.1 Endpoint Summary

| Method | Route | Auth | Summary |
|---|---|---|---|
| `POST` | `/challenges` | Bearer | Create a new challenge |
| `GET` | `/challenges/:id` | Bearer | Get challenge detail by ID |
| `DELETE` | `/challenges/:id` | Bearer | Delete a challenge (creator only) |
| `POST` | `/challenges/:id/join` | Bearer | Join a challenge |
| `POST` | `/challenges/:id/leave` | Bearer | Leave a challenge |
| `GET` | `/challenges` | Bearer | List challenges (updated filters) |
| `GET` | `/challenges/:id/leaderboard` | Bearer | Per-challenge leaderboard (existing) |
| `GET` | `/challenges/:id/progress` | Bearer | User progress for challenge (existing) |

### 2.2 `POST /challenges`

**Request Body:**

```json
{
  "title": "April Reading Sprint",
  "description": "Read 5 books this month to complete the challenge and earn the April Sprint badge.",
  "variant": "monthly",
  "metric": "books",
  "target": 5,
  "activeFrom": "2025-04-01",
  "activeTo": "2025-04-30",
  "badgeId": "badge-uuid"
}
```

**Field Rules:**

| Field | Type | Required | Constraints |
|---|---|---|---|
| `title` | string | Yes | 1-80 chars |
| `description` | string | No | max 500 chars |
| `variant` | string | Yes | `monthly`, `yearly`, `weekly`, `custom` |
| `metric` | string | Yes | `books`, `pages`, `hours`, `streak` |
| `target` | integer | Yes | min 1, max 9999 |
| `activeFrom` | string (date) | Yes | ISO date, ≥ today |
| `activeTo` | string (date) | Yes | ISO date, > activeFrom |
| `badgeId` | string | No | Must reference existing Badge |

**Response 201:**

```json
{
  "data": {
    "id": "uuid",
    "slug": "april-reading-sprint-abc123",
    "title": "April Reading Sprint",
    "description": "...",
    "variant": "monthly",
    "metric": "books",
    "target": 5,
    "creatorId": "user-uuid",
    "creatorName": "Alex K.",
    "participantCount": 1,
    "badgeId": "badge-uuid",
    "badgeText": null,
    "activeFrom": "2025-04-01",
    "activeTo": "2025-04-30",
    "current": 0,
    "isJoined": true,
    "isCreator": true
  }
}
```

**Behavior:**
- Generate unique `slug` from title + random suffix
- Set `creatorId` to authenticated user
- Creator is **auto-joined** to the challenge (`UserChallenge` row created with `current: 0`)
- `participantCount` computed from `UserChallenge` count
- If `badgeId` provided, validate it exists

**Errors:**
- `400` — validation error (invalid dates, missing required fields)
- `401` — unauthorized
- `404` — badgeId not found

---

### 2.3 `GET /challenges/:id`

**Response 200:**

```json
{
  "data": {
    "id": "uuid",
    "slug": "...",
    "title": "...",
    "description": "...",
    "variant": "monthly",
    "metric": "books",
    "target": 5,
    "creatorId": "user-uuid",
    "creatorName": "Alex K.",
    "participantCount": 1247,
    "badgeId": "badge-uuid",
    "badgeText": "19 days left",
    "activeFrom": "2025-04-01",
    "activeTo": "2025-04-30",
    "current": 3,
    "isJoined": true,
    "isCreator": false
  }
}
```

**Behavior:**
- Returns single challenge with user-specific context
- `current` = user's progress from `UserChallenge` (0 if not joined)
- `isJoined` = true if `UserChallenge` row exists for this user
- `isCreator` = true if `challenge.creatorId == user.id`
- `badgeText` computed: if active, show days left; if completed, show "Completed"; else "Upcoming"

**Errors:**
- `401` — unauthorized
- `404` — challenge not found

---

### 2.4 `DELETE /challenges/:id`

**Behavior:**
- Only the **creator** can delete their challenge
- Deleting a challenge **cascades** to all `UserChallenge` rows for that challenge
- System challenges (where `creatorId` is null) cannot be deleted by users

**Response:**
- `204 No Content` on success
- `403 Forbidden` if user is not the creator
- `404` if challenge not found

---

### 2.5 `POST /challenges/:id/join`

**Behavior:**
- Idempotent: joining an already-joined challenge returns the existing `UserChallenge`
- Creates `UserChallenge` row with `current: 0`
- Increments `participantCount`

**Response 200:**

```json
{
  "data": {
    "challengeId": "uuid",
    "current": 0,
    "completed": false,
    "completedAt": null
  }
}
```

**Errors:**
- `404` — challenge not found
- `409` — already joined (optional, can be treated as success)

---

### 2.6 `POST /challenges/:id/leave`

**Behavior:**
- Creator **cannot** leave their own challenge (they must cancel/delete it)
- Removes `UserChallenge` row
- Decrements `participantCount`

**Response:**
- `204 No Content` on success
- `403` if user is the creator
- `404` if challenge or participation not found

---

### 2.7 `GET /challenges` (Updated)

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `filter` | string | `active` | `active`, `monthly`, `yearly`, `weekly`, `custom` |
| `includeUpcoming` | boolean | `false` | Include challenges that haven't started yet |

**Response:**

Same shape as existing `GET /challenges`, but includes user-created challenges.

**Behavior changes:**
- Returns **all public** challenges (system + user-created) matching the filter
- `active` filter: `activeFrom <= today <= activeTo`
- Variant filters: match `variant` field
- Each item includes `current`, `isJoined`, `isCreator`, `participantCount`

---

## 3. Database Schema Changes

### 3.1 Updated `Challenge` Model

```prisma
model Challenge {
  id          String    @id @default(uuid())
  slug        String    @unique
  title       String
  subtitle    String?
  description String?
  goal        String?
  variant     String
  metric      String    @default("books")
  target      Int
  creatorId   String?   @map("creator_id")
  badgeId     String?   @map("badge_id")
  activeFrom  DateTime? @map("active_from") @db.Date
  activeTo    DateTime? @map("active_to") @db.Date
  createdAt   DateTime  @default(now()) @map("created_at")

  badge          Badge?          @relation(fields: [badgeId], references: [id])
  creator        User?           @relation(fields: [creatorId], references: [id])
  userChallenges UserChallenge[]

  @@map("challenges")
}
```

**New fields:**
- `description: String?` — longer challenge description
- `metric: String` — what is being measured (`books`, `pages`, `hours`, `streak`)
- `creatorId: String?` — who created this challenge (null = system challenge)

**Note:** `visibility` is **omitted** for MVP (all challenges are public).

### 3.2 Updated `User` Model

```prisma
model User {
  // ... existing fields ...

  userChallenges    UserChallenge[]
  createdChallenges Challenge[]     @relation("UserCreatedChallenges")

  @@map("users")
}
```

**New relation:**
- `createdChallenges` — one-to-many to `Challenge`

### 3.3 `UserChallenge` (Unchanged)

```prisma
model UserChallenge {
  userId      String    @map("user_id")
  challengeId String    @map("challenge_id")
  current     Int       @default(0)
  completedAt DateTime? @map("completed_at")

  user      User      @relation(fields: [userId], references: [id])
  challenge Challenge @relation(fields: [challengeId], references: [id], onDelete: Cascade)

  @@id([userId, challengeId])
  @@map("user_challenges")
}
```

**Cascade behavior:**
- `Challenge` deletion → all `UserChallenge` rows removed automatically (Prisma `onDelete: Cascade`)

### 3.4 Migration Order

1. Edit `prisma/schema.prisma`
2. Run `npm run db:migrate`
3. Run `npm run db:generate`

---

## 4. JSON Schema Updates

Add to `src/schemas/index.ts`:

```typescript
const CreateChallengeBody = {
  type: "object",
  required: ["title", "variant", "metric", "target", "activeFrom", "activeTo"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 80 },
    description: { type: "string", maxLength: 500 },
    variant: { type: "string", enum: ["monthly", "yearly", "weekly", "custom"] },
    metric: { type: "string", enum: ["books", "pages", "hours", "streak"] },
    target: { type: "integer", minimum: 1, maximum: 9999 },
    activeFrom: { type: "string", format: "date" },
    activeTo: { type: "string", format: "date" },
    badgeId: { type: "string" },
  },
};

const ChallengeDetail = {
  type: "object",
  required: ["id", "slug", "title", "variant", "metric", "target", "participantCount", "isJoined", "isCreator"],
  properties: {
    id: { type: "string" },
    slug: { type: "string" },
    title: { type: "string" },
    description: { type: "string", nullable: true },
    variant: { type: "string" },
    metric: { type: "string" },
    target: { type: "integer" },
    creatorId: { type: "string", nullable: true },
    creatorName: { type: "string", nullable: true },
    participantCount: { type: "integer" },
    badgeId: { type: "string", nullable: true },
    badgeText: { type: "string", nullable: true },
    activeFrom: { type: "string", format: "date", nullable: true },
    activeTo: { type: "string", format: "date", nullable: true },
    current: { type: "integer" },
    isJoined: { type: "boolean" },
    isCreator: { type: "boolean" },
  },
};
```

---

## 5. Mapper Updates

Update `src/lib/mappers.ts`:

```typescript
export function toChallenge(
  challenge: Prisma.ChallengeGetPayload<{ include: { creator: true } }>,
  currentProgress: number,
  isJoined: boolean,
  isCreator: boolean,
  participantCount: number
) {
  const today = new Date();
  const activeFrom = challenge.activeFrom;
  const activeTo = challenge.activeTo;

  let badgeText: string | null = null;
  if (activeFrom && activeTo) {
    if (today < activeFrom) {
      const days = Math.ceil((activeFrom.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      badgeText = `Starts in ${days} days`;
    } else if (today > activeTo) {
      badgeText = "Ended";
    } else {
      const daysLeft = Math.ceil((activeTo.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      badgeText = `${daysLeft} days left`;
    }
  }

  return {
    id: challenge.id,
    slug: challenge.slug,
    title: challenge.title,
    subtitle: challenge.subtitle,
    description: challenge.description,
    goal: challenge.goal,
    variant: challenge.variant,
    metric: challenge.metric,
    target: challenge.target,
    creatorId: challenge.creatorId,
    creatorName: challenge.creator?.name ?? null,
    participantCount,
    badgeId: challenge.badgeId,
    badgeText,
    activeFrom: challenge.activeFrom?.toISOString().split("T")[0] ?? null,
    activeTo: challenge.activeTo?.toISOString().split("T")[0] ?? null,
    current: currentProgress,
    isJoined,
    isCreator,
  };
}
```

---

## 6. Implementation Order

1. **Schema** — Update `prisma/schema.prisma`, migrate, generate
2. **Mappers** — Update `toChallenge`, add `toChallengeDetail`
3. **Schemas** — Add `CreateChallengeBody`, `ChallengeDetail` JSON schemas
4. **Routes** — Add new endpoints to `src/routes/challenges.ts`
5. **Tests** — Add integration tests for new endpoints
6. **Codegen** — Start backend, run frontend `npm run codegen`

---

## 7. Acceptance Criteria

- [ ] `POST /challenges` creates challenge with auto-generated slug
- [ ] Creator is auto-joined on creation
- [ ] `GET /challenges/:id` returns challenge with `isJoined`, `isCreator`, `participantCount`
- [ ] `DELETE /challenges/:id` removes challenge + all UserChallenges (cascade)
- [ ] Only creator can delete; returns 403 otherwise
- [ ] `POST /challenges/:id/join` creates UserChallenge row
- [ ] `POST /challenges/:id/leave` removes UserChallenge row
- [ ] Creator cannot leave (403)
- [ ] `GET /challenges` includes user-created challenges in results
- [ ] All endpoints have JSON Schema validation
- [ ] All integration tests pass
- [ ] Frontend codegen produces updated types successfully

---

## 8. Related Files

| File | Purpose |
|---|---|
| `../books-app/docs/features/challenges.md` | Frontend UI and state management spec |
| `prisma/schema.prisma` | Database schema |
| `src/routes/challenges.ts` | Route handlers |
| `src/lib/mappers.ts` | DB → API response transformers |
| `src/schemas/index.ts` | Shared JSON schemas |

---

*Generated following Spec-Driven Development pattern: API contract → Schema → Validation → Mapper → Routes → Tests.*
