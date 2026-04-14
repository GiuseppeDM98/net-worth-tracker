# Development Guidelines

> Based on battle-tested principles from clean code, domain-driven design, and pragmatic software engineering.

**Core Principle**: Code is written once and read many times. Every decision should optimize for the next person who has to understand, change, or debug it — including your future self.

---

## 🏗️ Code Structure & Architecture

### Single Responsibility
Every function, class, and module should do one thing and do it well. If you struggle to name it without using "and" or "or", it's doing too much.

**When to split**:
- A function exceeds ~30 lines
- A class has more than one reason to change
- A module handles both business logic and infrastructure concerns

**Example**:
```
// Bad: one function doing three different jobs
processOrderAndSendEmailAndUpdateInventory(order)

// Good: each step is isolated and composable
const validated = validateOrder(order)
const saved = await saveOrder(validated)
await notifyCustomer(saved)
await updateInventory(saved)
```

---

### Separation of Layers
Keep layers clean and unidirectional. Business logic must never leak into infrastructure, and infrastructure must never dictate business rules.

```
[API / Controller]       → Handles HTTP, input parsing, response formatting
       ↓
[Service / Use Case]     → Orchestrates business logic, pure domain operations
       ↓
[Repository / Gateway]   → Handles persistence, external APIs, I/O
```

**Rules**:
- Controllers don't contain business logic
- Services don't know about HTTP or SQL syntax
- Repositories don't validate business rules

---

### Abstraction Threshold
Not every repeated pattern needs an abstraction. Premature abstraction is as harmful as duplication.

**Abstract when**:
- The same logic appears 3+ times in different contexts (Rule of Three)
- The concept has a clear, stable name in the domain
- The abstraction simplifies call sites without hiding important context

**Don't abstract when**:
- Two things look similar but change for different reasons
- The abstraction would require more parameters than the original code
- You're guessing about future requirements

---

## 📛 Naming Conventions

### Names Are Documentation
A well-named variable, function, or class eliminates the need for a comment. Spend time on names — they are read far more often than they are written.

**Functions**: Use verb + noun. Name them by what they do, not how they do it.
```
// Bad
handle(), process(), doStuff(), compute()

// Good
validateUserEmail(), fetchOrderById(), calculateShippingCost()
```

**Booleans**: Use `is`, `has`, `can`, `should` prefixes.
```
// Bad
active, premium, flag, check

// Good
isActive, hasPremiumSubscription, canEdit, shouldRetry
```

**Collections**: Always plural.
```
// Bad
userList, orderArray, itemData

// Good
users, orders, items
```

**Avoid**:
- Single-letter names outside of short loops (`i`, `j` are fine in a 3-line for loop)
- Abbreviations unless universally understood (`url`, `id`, `dto` are fine; `usrMgr` is not)
- Misleading names (`data`, `info`, `manager`, `handler` — they say nothing)
- Encoding types in names (`userString`, `orderList` — the type system does this job)

---

### Consistency Over Cleverness
Pick a pattern and stick to it across the entire codebase. Inconsistency forces readers to hold two mental models simultaneously.

If you fetch data with `getUser()` in one place, don't use `fetchOrder()` in another. Choose `get` or `fetch` and be uniform.

---

## 🚨 Error Handling

### Errors Are Part of the Domain
Don't treat error handling as an afterthought. Errors should be as explicit and intentional as your happy path.

**Rules**:
- Never silently swallow exceptions
- Fail fast: validate inputs at the boundary, not deep in the call stack
- Distinguish between expected errors (invalid input, not found) and unexpected ones (database down, null reference)
- Error messages should help diagnose the problem, not just describe it

**Bad**:
```
try {
  processOrder(order)
} catch (e) {
  console.log("error")  // swallowed, untraceable
}
```

**Good**:
```
try {
  processOrder(order)
} catch (e) {
  logger.error("Failed to process order", {
    orderId: order.id,
    reason: e.message,
    stack: e.stack
  })
  throw new OrderProcessingError("Order processing failed", { cause: e })
}
```

---

### Errors at the Right Level
Handle errors where you have enough context to do something useful about them. Catching an exception only to rethrow it unchanged adds noise without value.

- **Repository layer**: Translate infrastructure errors into domain errors (e.g., `DbException` → `ResourceNotFoundException`)
- **Service layer**: Handle business rule violations
- **Controller/API layer**: Translate domain errors into HTTP responses

---

## ✅ Testing Strategy

### Test Behaviour, Not Implementation
Tests should verify what the code does, not how it does it internally. Tests coupled to implementation details break whenever you refactor, even if the behaviour is unchanged.

**What to test**:
- Public interfaces and return values
- Business rules and edge cases
- Error conditions and boundary values
- Integration points between layers

**What not to test**:
- Private methods directly
- Framework or library internals
- One-liner getters/setters with no logic

---

### AAA Structure
Every test should follow Arrange → Act → Assert. Keep each section distinct and readable.

```
test("should return error when email is already taken") {
  // Arrange
  const existingUser = createUser({ email: "test@example.com" })
  await userRepository.save(existingUser)

  // Act
  const result = await registerUser({ email: "test@example.com" })

  // Assert
  expect(result).toBeError(EmailAlreadyTakenError)
}
```

---

### Test Naming
Test names are documentation. They should read as plain sentences describing a scenario.

```
// Bad
test("user test 1")
test("registration fails")

// Good
test("should reject registration when email is already in use")
test("should assign default role when no role is specified")
```

---

### Test Pyramid
Balance your test suite by speed and scope:

```
         [E2E]           ← Few, slow, high confidence
       [Integration]     ← Some, moderate speed
     [Unit Tests]        ← Many, fast, isolated
```

Unit tests cover logic. Integration tests cover wiring. E2E tests cover critical user paths only.

---

## 🔀 Git & Versioning

### Commit Messages
Use [Conventional Commits](https://www.conventionalcommits.org/). Every commit message should complete the sentence: *"If applied, this commit will..."*

```
feat: add JWT refresh token rotation
fix: prevent double-submission on order form
refactor: extract payment validation into separate service
chore: update dependencies to latest patch versions
docs: add API authentication section to README
```

**Rules**:
- Subject line: max 72 characters, imperative mood, no period
- Body (when needed): explain WHY, not what — the diff shows the what
- Reference issue tracker IDs when relevant: `fix: handle null address (#142)`

---

### Branch Naming
```
feature/short-description
fix/short-description
refactor/short-description
chore/short-description
```

Keep names lowercase, hyphen-separated, and specific enough to be identifiable at a glance.

---

### Commit Scope
Each commit should represent a single logical change. If your commit message requires "and", consider splitting it.

**Don't mix**:
- Refactoring with feature work
- Formatting changes with logic changes
- Multiple unrelated fixes in a single commit

---

## 🤖 Writing AI-Friendly Code

When working with AI coding agents (like Claude Code), the same principles that make code readable for humans make it workable for AI — but the stakes are higher. An AI has no accumulated context between sessions. Everything it needs to understand your codebase must be visible in the code itself.

### Keep Functions Small and Focused
AI agents reason better on small units of code with a clear contract. A 200-line function with multiple responsibilities and implicit side effects is hard to modify safely for anyone — human or AI.

A good heuristic: if a function can be understood in full within a single screen, it can be modified confidently.

---

### Make Dependencies Explicit
Implicit dependencies — global state, hidden context, ambient configuration — are invisible to an AI unless it reads every file. Prefer dependency injection and explicit parameters.

```
// Bad: hidden dependency on global config
function sendEmail(to) {
  const client = globalMailClient  // where does this come from?
  client.send(to, config.defaultSender)
}

// Good: all dependencies are visible at the call site
function sendEmail(to, mailClient, senderAddress) {
  mailClient.send(to, senderAddress)
}
```

---

### Use Types and Interfaces Aggressively
Type signatures are contracts. An AI (and a human) can understand what a function does just by reading its signature, without diving into the implementation.

Well-typed code also catches a large class of AI-introduced bugs at compile time before they reach runtime.

---

### Prefer Explicit Over Clever
Magic, metaprogramming, and overly terse code are hostile to AI modification. If understanding a line requires knowing the implicit conventions of a specific framework version, an AI will often get it wrong.

```
// Hard for AI to modify safely: implicit, magic-heavy
@AutoMap
class OrderDto extends BaseDto<Order> {}

// Easy to modify safely: explicit, self-contained
class OrderDto {
  id: string
  customerId: string
  totalAmount: number
  status: OrderStatus
}
```

---

### Enforce Consistent Patterns
If the same concept is handled differently in different parts of the codebase, an AI will generalise inconsistently. Pick one pattern for error handling, one pattern for async operations, one pattern for data fetching — and use it everywhere.

Consistency turns pattern-matching from a liability into an asset.

---

## 🔒 Security Baseline

These rules are non-negotiable. They apply to every project, every language, every environment.

**Secrets management**:
- Never hardcode credentials, tokens, or keys in source code
- Use environment variables or a secrets manager (Vault, AWS Secrets Manager, etc.)
- Ensure `.env` files are in `.gitignore` before the first commit — not after

**Input validation**:
- Validate and sanitise all external input at the system boundary
- Never trust data from clients, third-party APIs, or even your own database if the schema allows null
- Use allowlists, not denylists

**Dependencies**:
- Pin dependency versions in production
- Run `audit` / `outdated` checks regularly
- Remove unused dependencies — they are attack surface

**Principle of least privilege**:
- Database users should only have the permissions they need
- API tokens should have the minimum required scopes
- Services should not share credentials with each other

---

## ⚡ Performance Guidelines

### Don't Optimise Prematurely
Write clear code first. Profile before optimising. Most performance problems are in a small fraction of the codebase, and guessing wastes time while reducing readability.

**Measure, don't assume.**

---

### Known Pitfalls to Avoid Proactively
Some problems are common enough to guard against by default, without profiling:

- **N+1 queries**: Never fetch a collection and then query each item individually in a loop. Use joins, eager loading, or batch fetching.
- **Blocking async**: In async code, never call synchronous blocking operations on the main thread/event loop.
- **Missing indexes**: Foreign keys and frequently filtered columns should be indexed. Add indexes at migration time, not after slowdowns appear in production.
- **Unbounded queries**: Always paginate queries that can return large result sets. Never `SELECT *` without a `LIMIT`.

---

### Caching
Cache at the right layer for the right reason:

- **In-memory (local cache)**: Fast lookups for immutable or rarely-changing reference data
- **Distributed cache (Redis etc.)**: Shared state across instances, session data, rate limiting
- **HTTP cache headers**: Static assets, public API responses

Always define: what invalidates the cache, and what happens if stale data is served.

---

## 🔄 Refactoring

### Refactor Continuously, Not in Batches
Refactoring is not a project. It is a habit. Leave every file slightly better than you found it (Boy Scout Rule). Large refactoring projects accumulate risk and context-switch cost.

---

### Signals That Refactoring Is Needed

**Code smells to act on**:
- **Long functions**: More than ~30 lines is a warning sign
- **Deep nesting**: More than 2–3 levels of indented logic — flatten with early returns
- **Duplicate logic**: The same logic copy-pasted in 3+ places
- **Large parameter lists**: More than 3–4 parameters usually means a missing abstraction
- **Feature envy**: A function that spends most of its time accessing another object's data belongs in that object
- **Magic numbers/strings**: Unnamed literals with non-obvious meaning should be named constants

---

### Refactoring Rules
- Refactor with tests in place. If there are no tests, write them first.
- Never mix refactoring with feature work in the same commit.
- Refactor in small steps — one concern at a time, verifying correctness after each step.

---

## 🎯 Golden Rules

### 1. Optimise for Readability
You write code once. You (and others) read it dozens of times. Optimise for the reader.

### 2. Make It Work, Make It Right, Make It Fast
In that order. Premature optimisation and premature abstraction are the same mistake.

### 3. Explicit Over Implicit
Clever tricks, hidden conventions, and magic reduce readability without adding value. Say what you mean.

### 4. Consistency Is a Feature
A codebase where everything follows the same patterns is easier to navigate, easier to reason about, and easier for AI agents to extend correctly.

### 5. Leave It Better Than You Found It
Every time you touch a file, improve something small. Over time, this compounds into a significantly cleaner codebase.

---

## 🎓 Remember

> "Any fool can write code that a computer can understand. Good programmers write code that humans can understand."
>
> — Martin Fowler

> "The ratio of time spent reading code versus writing it is well over 10:1. We are constantly reading old code as part of the effort to write new code."
>
> — Robert C. Martin

**These guidelines exist not to constrain you, but to reduce the cognitive load on everyone who works on the codebase — including AI agents and your future self.**
