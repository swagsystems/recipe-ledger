import { prisma } from "@/lib/prisma";

export type ApprovalSettings = {
  protein_g: number;
  fiber_g: number;
};

export async function getApprovalSettings(): Promise<ApprovalSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: "auto_approval" } });
  const value = row?.value as Partial<ApprovalSettings> | undefined;

  return {
    protein_g: Number(value?.protein_g ?? 20),
    fiber_g: Number(value?.fiber_g ?? 5)
  };
}
