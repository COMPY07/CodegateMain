// E19 shared helper.
// Callers differ.

import { prisma } from "./db";

export function remove(id: string, tenantId: string) {
  return prisma.project.deleteMany({ where: { id, tenantId } });
}
