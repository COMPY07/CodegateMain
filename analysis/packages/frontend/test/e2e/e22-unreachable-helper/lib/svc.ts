// Delete helper.

import { prisma } from "./db";

export async function remove(id: string) {
  await prisma.project.delete({ where: { id } });
}
