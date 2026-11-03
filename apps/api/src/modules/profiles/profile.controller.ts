import {
  Controller,
  Get,
  Put,
  Patch,
  Body,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ProfileRepository } from "../../common/repositories/profile.repository.js";
import { AuthGuard, type VerifiedUser } from "../../common/guards/auth.guard.js";
import { CurrentUser } from "../../common/guards/current-user.decorator.js";
import { ZodValidationInterceptor } from "../../common/validation/zod-validation.interceptor.js";
import {
  createProfileBodySchema,
  updateProfileBodySchema,
  type PrivateProfileDto,
  type CreateProfileBody,
  type UpdateProfileBody,
} from "@neighborhood/contracts";

@Controller("me")
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(private readonly profileRepo: ProfileRepository) {}

  @Get()
  async getProfile(@CurrentUser() user: VerifiedUser): Promise<
    | { setupNeeded: true; uid: string; email: string | undefined }
    | { setupNeeded: false; profile: PrivateProfileDto }
  > {
    const profile = await this.profileRepo.getByUid(user.uid);

    if (!profile || !profile.completedProfile) {
      return {
        setupNeeded: true,
        uid: user.uid,
        email: user.email,
      };
    }

    return { setupNeeded: false, profile: profile as PrivateProfileDto };
  }

  @Put("profile")
  @UseInterceptors(new ZodValidationInterceptor(createProfileBodySchema))
  async createProfile(
    @CurrentUser() user: VerifiedUser,
    @Body() body: CreateProfileBody,
  ): Promise<PrivateProfileDto> {
    const profile = await this.profileRepo.create(
      user.uid,
      user.email ?? "",
      body,
    );
    return profile as PrivateProfileDto;
  }

  @Patch("profile")
  @UseInterceptors(new ZodValidationInterceptor(updateProfileBodySchema))
  async updateProfile(
    @CurrentUser() user: VerifiedUser,
    @Body() body: UpdateProfileBody,
  ): Promise<PrivateProfileDto> {
    const profile = await this.profileRepo.update(user.uid, body);
    return profile as PrivateProfileDto;
  }
}
