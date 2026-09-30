const uniqueViolation = "23505";

function violatedConstraint(error: unknown): string | null {
  let cursor: unknown = error;
  while (typeof cursor === "object" && cursor !== null) {
    if (
      "code" in cursor &&
      cursor.code === uniqueViolation &&
      "constraint_name" in cursor &&
      typeof cursor.constraint_name === "string"
    ) {
      return cursor.constraint_name;
    }
    cursor = "cause" in cursor ? cursor.cause : null;
  }
  return null;
}

export function isUniqueViolation(error: unknown, constraint: string): boolean {
  return violatedConstraint(error) === constraint;
}
