// Project service.
// No tenant check.

import { prisma } from "./db";

export async function deleteProject(id: string) {
  await prisma.project.delete({
    where: { id },
  });
}
