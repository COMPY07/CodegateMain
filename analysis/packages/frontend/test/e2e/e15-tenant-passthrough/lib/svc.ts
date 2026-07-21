// E15 scoped service.
// Tenant from param.

import { prisma } from "./db";

export function removeScoped(id: string, tenantId: string) {
  return prisma.project.deleteMany({ where: { id, tenantId } });
}
