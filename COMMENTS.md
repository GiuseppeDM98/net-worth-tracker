# Code Comments Guidelines

> Based on antirez's "[Writing system software: code comments](https://antirez.com/news/124)"

**Core Principle**: Comments reduce cognitive load. They explain WHY and provide context that code alone cannot express.

---

## 📚 Comment Types (Use These)

### 1. Function Comments
**Purpose**: Let readers treat code as a black box. Document the interface, not the implementation.

**When**: At the top of functions, classes, or modules.

**What to include**:
- What the function does
- Parameters and return values
- Preconditions, postconditions, side effects

**Example**:
```python
def find_max_key(root):
    """
    Seek the greatest key in the subtree.
    
    Args:
        root: Root node of the subtree to search
        
    Returns:
        int: The maximum key value found
        
    Raises:
        MemoryError: If out of memory during traversal
    """
    # implementation
```

---

### 2. Design Comments
**Purpose**: Explain high-level architecture, algorithms, and trade-offs.

**When**: At the start of files or major sections.

**What to include**:
- Overall approach and reasoning
- Why this solution vs alternatives
- Trade-offs made
- References to external resources if applicable

**Example**:
```python
"""
B-Tree Index Implementation

We chose a B-tree over a hash table because:
1. We need ordered iteration
2. Range queries are common in our use case
3. Memory usage is more predictable

The implementation uses a branching factor of 64 to optimize
for cache line size on modern CPUs.
"""
```

---

### 3. Why Comments
**Purpose**: Explain reasoning behind non-obvious decisions. The code shows WHAT, comments explain WHY.

**When**: Code that might seem wrong, inefficient, or unnecessarily complex.

**Example**:
```javascript
// We must flush the buffer before closing the connection
// because the remote server has a 2-second timeout and
// large payloads can take longer to transmit
flushBuffer();
closeConnection();

// Increment DB ID *before* processing, not after.
// If we timeout mid-loop, we'll resume from the next DB
// instead of retrying the same one indefinitely.
currentDb++;
processDatabase(db);
```

---

### 4. Teacher Comments
**Purpose**: Teach domain concepts (math, algorithms, protocols) that readers may not know.

**When**: Using specialized knowledge or non-obvious techniques.

**Example**:
```python
# Luhn algorithm (modulo 10) for credit card validation:
# 1. Starting from the rightmost digit, double every second digit
# 2. If doubling results in a number > 9, subtract 9
# 3. Sum all the digits
# 4. If sum is divisible by 10, the number is valid
# Reference: https://en.wikipedia.org/wiki/Luhn_algorithm
def validate_card_number(number):
    # implementation
```

---

### 5. Guide Comments
**Purpose**: Lower cognitive load by dividing code into logical sections and introducing what's next.

**When**: In longer functions or complex logic flows.

**Example**:
```python
def cleanup_client(client):
    # Log disconnection event
    if client.is_replica:
        log_warning(f"Connection with replica {client.name} lost")
    
    # Free the query buffer
    del client.query_buffer
    
    # Unblock any pending operations
    if client.is_blocked:
        unblock_client(client)
    
    # Unsubscribe from all pubsub channels
    unsubscribe_all_channels(client)
    
    # Close socket and cleanup I/O handlers
    unlink_client(client)
```

**Key**: Each comment introduces the next logical block. They create rhythm and structure.

---

### 6. Checklist Comments
**Purpose**: Remind developers of necessary updates in other parts of the codebase.

**When**: Changes in one place require updates elsewhere due to language/design limitations.

**Example**:
```typescript
// WARNING: If you add a type here, also update:
// - getTypeNameByID() in utils.ts
// - Type validation in schema.ts
enum DataType {
    STRING,
    NUMBER,
    BOOLEAN
}
```

---

## 🚫 Comments to Avoid

### Trivial Comments
Comments that require MORE effort to read than the code itself.

**Bad**:
```python
i += 1  # Increment i
```

**Why**: The code is self-explanatory. The comment adds no value.

---

### Debt Comments
TODO, FIXME, XXX comments accumulate and are often ignored.

**Bad**:
```python
# TODO: fix this later
# FIXME: not handling edge case
# XXX: this is a hack
```

**Better**: Use issue tracker instead. If you must use them:
- Include ticket number: `# TODO(#123): refactor after v2.0`
- Add date and author: `# FIXME(2024-01-15, @giuseppe): ...`
- Be specific about what needs doing

---

### Backup Comments
Never leave old code commented out. That's what version control is for.

**Bad**:
```java
// Old implementation
// return calculateTotal(items, tax);

// New implementation
return calculateTotalWithDiscount(items, tax, discount);
```

**Why**: Creates confusion and clutter. Use git to see old versions.

---

## 🎯 Golden Rules

### 1. Comments Explain WHY, Not WHAT
The code shows what's happening. Comments provide context and reasoning.

### 2. Keep Comments Updated
Outdated comments are worse than no comments. When you modify code, update related comments.

### 3. Write for Future Readers
Assume readers are intelligent but unfamiliar with the specific context. Make it easy for them to understand.

### 4. Reduce Cognitive Load
Good comments make code faster to understand. They guide the reader's mental model.

---

## 📏 When to Comment

**Always comment**:
- Non-obvious decisions
- Complex algorithms
- Domain-specific knowledge
- Workarounds or gotchas
- Function interfaces

**Rarely comment**:
- Obvious code (`x = 0  # Set x to zero`)
- Self-documenting code with clear variable names
- Temporary or draft code

**Never comment**:
- To hide bad code (refactor instead)
- Old versions of code (use git)
- What the code does (let the code speak)

---

## ✍️ Writing Style

### Be Concise
```python
# Good: Check if user has premium subscription
if user.is_premium:

# Bad: This conditional statement checks whether the user
# object has the premium flag set to true, which indicates...
if user.is_premium:
```

### Be Specific
```python
# Good: Skip system users (ID < 100) to avoid permission errors
if user.id < 100:
    continue

# Bad: Skip some users
if user.id < 100:
    continue
```

### Use Proper Grammar
- Start with capital letter
- Use complete sentences for multi-line comments
- Use proper punctuation

---

## 🔄 Comments as Analysis Tool

**Writing comments forces you to**:
- Understand your own code deeply
- Question your design decisions
- Find bugs and edge cases
- Document guarantees and side effects

**If you can't explain it clearly in a comment, the code might need refactoring.**

---

## 🎓 Remember

> "Writing good comments is harder than writing good code. Comments require understanding the code in a deeper sense and developing your writing skills."
> 
> — antirez

**Comments are not a lesser form of work. They are essential documentation that travels with the code and gets updated with the code.**
