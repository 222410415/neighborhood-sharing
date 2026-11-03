import { Controller, Get } from "@nestjs/common";
import { ReferenceDataRepository } from "../../common/repositories/reference-data.repository.js";
import type { ReferenceDataResponse } from "@neighborhood/contracts";

@Controller("reference-data")
export class ReferenceDataController {
  constructor(private readonly repo: ReferenceDataRepository) {}

  @Get()
  async getReferenceData(): Promise<ReferenceDataResponse> {
    return this.repo.getAll();
  }
}
