# AI Agent Guidelines for Code Development

This document provides instructions for AI agents working on this codebase. Follow these principles when proposing new code or modifying existing code.

## General Principles

### Readability and Maintainability
- Use descriptive names for variables, functions, and classes
- Avoid ambiguous abbreviations
- Write code that is self-documenting where possible
- Structure code for clarity and ease of understanding

### SOLID Principles
- **Single Responsibility Principle**: Each class/function should have one clear purpose
- **Open/Closed Principle**: Code should be open for extension but closed for modification
- **Liskov Substitution Principle**: Subtypes must be substitutable for their base types
- **Interface Segregation Principle**: Keep interfaces focused and minimal
- **Dependency Inversion Principle**: Depend on abstractions, not concretions

### DRY (Don't Repeat Yourself)
- Avoid code duplication
- Extract common logic into reusable functions or modules
- Use abstraction to eliminate redundancy

### Compact Functions
- Keep functions short and focused on a single task
- A function should do one thing and do it well
- If a function becomes too long, consider breaking it into smaller functions

### Error Handling
- Implement robust and informative error handling
- Provide meaningful error messages
- Handle edge cases and unexpected inputs gracefully
- Use appropriate error handling mechanisms for the language

### Testing
- Provide unit tests for new features
- Ensure tests are comprehensive and cover edge cases
- Write tests that are maintainable and easy to understand
- Follow testing best practices for the language/framework

### Style Conventions
- Follow the established conventions for the specific programming language
- Maintain consistent indentation, spacing, and formatting
- Adhere to the project's existing code style
- Use linters and formatters where available

---

## Comment Guidelines

**IMPORTANT: All comments must be written in English.**

Comments are essential for reducing the reader's cognitive load and explaining information that is not obvious from the code itself. Use comments strategically to make the codebase more accessible and maintainable.

### Recommended Comment Types

#### 1. Function Comments
Document the interface of functions, classes, and modules.

**Purpose:**
- Allow readers to treat code as a black box
- Describe what the function does, its parameters, and return values
- Document preconditions, postconditions, and side effects

**Placement:** At the beginning of functions, classes, or macros

**Example:**
```c
/* 
 * Seek the greatest key in the subtree.
 * Return 0 on out of memory, otherwise 1.
 */
int findMaxKey(Node* root) {
    // implementation
}
```

#### 2. Design Comments
Explain high-level architecture and design decisions.

**Purpose:**
- Provide a high-level overview of the implementation
- Explain algorithms, techniques, and architectural choices
- Justify why certain approaches were chosen
- Document trade-offs and alternatives considered

**Placement:** Usually at the beginning of files or major sections

**Example:**
```python
"""
This module implements a B-tree index for fast lookups.

We chose a B-tree over a hash table because:
1. We need ordered iteration
2. Range queries are common in our use case
3. Memory usage is more predictable

The implementation uses a branching factor of 64 to optimize
for cache line size on modern CPUs.
"""
```

#### 3. Why Comments
Explain the reasoning behind non-obvious code.

**Purpose:**
- Explain WHY the code does something, not WHAT it does
- Prevent future modifications that could introduce bugs
- Document business logic or domain-specific requirements
- Clarify decisions that might seem strange or counterintuitive

**Example:**
```javascript
// We must flush the buffer before closing the connection
// because the remote server has a 2-second timeout and
// large payloads can take longer to transmit
flushBuffer();
closeConnection();
```

#### 4. Teacher Comments
Educate readers about domain concepts.

**Purpose:**
- Teach domain-specific concepts (math, algorithms, protocols)
- Make the code accessible to more developers
- Explain specialized terminology or techniques
- Provide references to external resources

**Example:**
```java
/*
 * This implements the Luhn algorithm (modulo 10) for credit card validation.
 * The algorithm works by:
 * 1. Starting from the rightmost digit, double every second digit
 * 2. If doubling results in a number > 9, subtract 9
 * 3. Sum all the digits
 * 4. If the sum is divisible by 10, the number is valid
 * 
 * Reference: https://en.wikipedia.org/wiki/Luhn_algorithm
 */
```

#### 5. Guide Comments
Help readers navigate and understand code structure.

**Purpose:**
- Assist readers in processing the code
- Provide clear division and rhythm
- Introduce major sections or logical blocks
- Act as "chapter headings" for code

**Example:**
```c
/* Initialize connection pool */
connectionPool = createPool(config);

/* Register event handlers */
registerOnConnect(handleConnect);
registerOnError(handleError);

/* Free the query buffer */
freeBuffer(queryBuffer);
```

#### 6. Checklist Comments
Remind developers of necessary updates.

**Purpose:**
- Highlight dependencies between different parts of the code
- Warn about changes that require updates elsewhere
- Prevent incomplete modifications

**Example:**
```typescript
// Warning: if you add a type here, update getTypeNameByID() in utils.ts
enum DataType {
    STRING,
    NUMBER,
    BOOLEAN
}
```

---

### Comments to Avoid

#### Trivial Comments
Comments that require more cognitive effort than the code itself.

**Bad Example:**
```python
# Increment i
i += 1
```

**Why to avoid:** The code is already self-explanatory. The comment adds no value and creates maintenance burden.

#### Debt Comments
TODO, FIXME, XXX comments should be minimized.

**Why to avoid:**
- They accumulate over time
- They're often ignored
- They should be tracked in an issue tracker instead

**If you must use them:**
- Include a ticket number or issue reference
- Add a date and author
- Be specific about what needs to be done

#### Backup Comments
Never leave old versions of code commented out.

**Bad Example:**
```java
// Old implementation
// return calculateTotal(items, tax);

// New implementation
return calculateTotalWithDiscount(items, tax, discount);
```

**Why to avoid:**
- Use version control instead
- Commented code creates confusion
- It clutters the codebase

---

## Additional Principles

### The Golden Rule of Comments
**Comments should explain WHY, not WHAT.**

The code itself shows what is happening. Comments should provide context, reasoning, and information that cannot be expressed in code.

### Keep Comments Updated
- When you modify code, update the relevant comments
- Outdated comments are worse than no comments
- Make comment maintenance part of the code review process

### Reduce Cognitive Load
- Write comments that help readers understand the code faster
- Consider the context and background knowledge of your audience
- Provide the right level of detail for the situation

### Write for the Future
- Write comments thinking about the future reader (who might be you)
- Assume the reader is intelligent but unfamiliar with the specific context
- Make it easy for others to understand and modify the code

---

## Language-Specific Notes

When working with specific programming languages, also follow:
- Language-specific style guides (PEP 8 for Python, Google Style Guide for Java, etc.)
- Framework-specific conventions and best practices
- Project-specific coding standards documented elsewhere in the repository

---

## Conclusion

These guidelines aim to maintain high code quality and readability. When in doubt:
1. Prioritize clarity over cleverness
2. Write code for humans, not just machines
3. Consider the maintainability impact of every change
4. Ask yourself: "Will I understand this in 6 months?"

Remember: Good code is not just about functionality—it's about creating a maintainable and understandable system that evolves gracefully over time.