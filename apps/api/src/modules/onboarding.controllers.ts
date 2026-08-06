import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRole } from '@casas/database';
import {
  acceptInvitationSchema,
  createInvitationSchema,
  createProfileSchema,
  householdSchema,
  putWorkScheduleSchema,
  rejectConditionsSchema,
  rejectInvitationSchema,
  relationshipConditionsSchema,
  revokeInvitationSchema,
  updateHouseholdSchema,
  updateProfileSchema,
} from '@casas/contracts';
import type { Response } from 'express';
import { Actor, Public, Roles, type AuthenticatedActor } from '../common/auth/auth.types';
import { refreshAccessCookie } from '../common/auth/cookies';
import { ZodValidationPipe } from '../common/http/zod-validation.pipe';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { IdentityService } from './identity/identity.service';
import { EmployersService, type ProfileView } from './employers/employers.service';
import { WorkersService } from './workers/workers.service';
import { HouseholdsService, type HouseholdView } from './households/households.service';
import {
  InvitationsService,
  type InvitationView,
  type ResolvedInvitation,
} from './employment-relationships/invitations.service';
import {
  RelationshipsService,
  type RelationshipView,
  type ScheduleView,
} from './employment-relationships/relationships.service';
import { WorkSchedulesService } from './work-schedules/work-schedules.service';

/**
 * Perfil recién creado, con el access token que ya declara el rol otorgado.
 *
 * Crear el perfil cambia los roles del usuario en medio de una sesión abierta.
 * El token con el que llegó el request se emitió antes y todavía dice `roles: []`,
 * así que se emite uno nuevo acá mismo: sin esto, la persona completa el alta y
 * la pantalla siguiente le responde 403 hasta que el token expire.
 */
export interface ProfileCreatedView extends ProfileView {
  accessToken: string;
}

// ─── Perfil de familia ───────────────────────────────────────────────────────

@ApiTags('employer-profile')
@Controller('employer-profile')
export class EmployerProfileController {
  constructor(
    private readonly employers: EmployersService,
    private readonly identity: IdentityService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crea el perfil de familia y otorga el rol FAMILY_EMPLOYER' })
  async create(
    @Actor() actor: AuthenticatedActor,
    @Body(new ZodValidationPipe(createProfileSchema))
    body: Parameters<EmployersService['create']>[1],
    @Res({ passthrough: true }) response: Response,
  ): Promise<ProfileCreatedView> {
    const profile = await this.employers.create(actor, body);
    const accessToken = await this.identity.issueAccessTokenFor(actor.userId, actor.sessionId);
    refreshAccessCookie(response, this.config, accessToken);
    return { ...profile, accessToken };
  }

  @Get()
  get(@Actor() actor: AuthenticatedActor): Promise<ProfileView> {
    return this.employers.get(actor);
  }

  @Patch()
  @Roles(PlatformRole.FAMILY_EMPLOYER)
  update(
    @Actor() actor: AuthenticatedActor,
    @Body(new ZodValidationPipe(updateProfileSchema))
    body: Parameters<EmployersService['update']>[1],
  ): Promise<ProfileView> {
    return this.employers.update(actor, body);
  }
}

// ─── Perfil de trabajadora ───────────────────────────────────────────────────

@ApiTags('worker-profile')
@Controller('worker-profile')
export class WorkerProfileController {
  constructor(
    private readonly workers: WorkersService,
    private readonly identity: IdentityService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crea el perfil de trabajadora y otorga el rol WORKER' })
  async create(
    @Actor() actor: AuthenticatedActor,
    @Body(new ZodValidationPipe(createProfileSchema)) body: Parameters<WorkersService['create']>[1],
    @Res({ passthrough: true }) response: Response,
  ): Promise<ProfileCreatedView> {
    const profile = await this.workers.create(actor, body);
    const accessToken = await this.identity.issueAccessTokenFor(actor.userId, actor.sessionId);
    refreshAccessCookie(response, this.config, accessToken);
    return { ...profile, accessToken };
  }

  @Get()
  get(@Actor() actor: AuthenticatedActor): Promise<ProfileView> {
    return this.workers.get(actor);
  }

  @Patch()
  @Roles(PlatformRole.WORKER)
  update(
    @Actor() actor: AuthenticatedActor,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: Parameters<WorkersService['update']>[1],
  ): Promise<ProfileView> {
    return this.workers.update(actor, body);
  }
}

// ─── Domicilios ──────────────────────────────────────────────────────────────

@ApiTags('households')
@Controller('households')
@Roles(PlatformRole.FAMILY_EMPLOYER)
export class HouseholdsController {
  constructor(private readonly households: HouseholdsService) {}

  @Post()
  create(
    @Actor() actor: AuthenticatedActor,
    @Body(new ZodValidationPipe(householdSchema)) body: Parameters<HouseholdsService['create']>[1],
  ): Promise<HouseholdView> {
    return this.households.create(actor, body);
  }

  @Get()
  list(@Actor() actor: AuthenticatedActor): Promise<HouseholdView[]> {
    return this.households.list(actor);
  }

  @Get(':id')
  get(
    @Actor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<HouseholdView> {
    return this.households.getOwned(actor, id);
  }

  @Patch(':id')
  update(
    @Actor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateHouseholdSchema))
    body: Parameters<HouseholdsService['update']>[2],
  ): Promise<HouseholdView> {
    return this.households.update(actor, id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Baja lógica del domicilio. Nunca borrado físico.' })
  async archive(
    @Actor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.households.archive(actor, id);
    return { ok: true };
  }
}

// ─── Invitaciones ────────────────────────────────────────────────────────────

@ApiTags('worker-invitations')
@Controller('worker-invitations')
export class WorkerInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  @Roles(PlatformRole.FAMILY_EMPLOYER)
  create(
    @Actor() actor: AuthenticatedActor,
    @Body(new ZodValidationPipe(createInvitationSchema))
    body: Parameters<InvitationsService['create']>[1],
  ): Promise<InvitationView> {
    return this.invitations.create(actor, body);
  }

  @Get()
  @Roles(PlatformRole.FAMILY_EMPLOYER)
  list(@Actor() actor: AuthenticatedActor): Promise<InvitationView[]> {
    return this.invitations.listForEmployer(actor);
  }

  @Post(':id/revoke')
  @Roles(PlatformRole.FAMILY_EMPLOYER)
  async revoke(
    @Actor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(revokeInvitationSchema)) body: { reason?: string },
  ): Promise<{ ok: true }> {
    await this.invitations.revoke(actor, id, body.reason);
    return { ok: true };
  }

  @Post(':id/resend')
  @Roles(PlatformRole.FAMILY_EMPLOYER)
  resend(
    @Actor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InvitationView> {
    return this.invitations.resend(actor, id);
  }

  /**
   * Público: quien abre el enlace puede todavía no tener sesión.
   *
   * El token identifica la invitación pero no autoriza nada más: aceptarla exige
   * sesión y que el correo coincida.
   */
  @Public()
  @Get('resolve/:token')
  resolve(@Param('token') token: string): Promise<ResolvedInvitation> {
    return this.invitations.resolveByToken(token);
  }

  @Post('accept')
  @Roles(PlatformRole.WORKER)
  accept(
    @Actor() actor: AuthenticatedActor,
    @Body(new ZodValidationPipe(acceptInvitationSchema)) body: { token: string },
  ): Promise<{ relationshipId: string }> {
    return this.invitations.accept(actor, body.token);
  }

  @Post('reject')
  @Roles(PlatformRole.WORKER)
  async reject(
    @Actor() actor: AuthenticatedActor,
    @Body(new ZodValidationPipe(rejectInvitationSchema)) body: { token: string; reason?: string },
  ): Promise<{ ok: true }> {
    await this.invitations.reject(actor, body.token, body.reason);
    return { ok: true };
  }
}

// ─── Relación laboral y calendario ───────────────────────────────────────────

@ApiTags('employment-relationships')
@Controller('employment-relationships')
export class EmploymentRelationshipsController {
  constructor(
    private readonly relationships: RelationshipsService,
    private readonly schedules: WorkSchedulesService,
  ) {}

  @Get()
  list(@Actor() actor: AuthenticatedActor): Promise<RelationshipView[]> {
    return this.relationships.list(actor);
  }

  @Get(':id')
  get(
    @Actor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RelationshipView> {
    return this.relationships.getParticipating(actor, id);
  }

  @Patch(':id/conditions')
  @Roles(PlatformRole.FAMILY_EMPLOYER)
  saveConditions(
    @Actor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(relationshipConditionsSchema))
    body: Parameters<RelationshipsService['saveConditions']>[2],
  ): Promise<RelationshipView> {
    return this.relationships.saveConditions(actor, id, body);
  }

  @Post(':id/submit')
  @Roles(PlatformRole.FAMILY_EMPLOYER)
  submit(
    @Actor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RelationshipView> {
    return this.relationships.submitConditions(actor, id);
  }

  @Post(':id/accept')
  @Roles(PlatformRole.WORKER)
  @ApiOperation({ summary: 'La trabajadora acepta las condiciones. Único camino a ACTIVE.' })
  accept(
    @Actor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RelationshipView> {
    return this.relationships.acceptConditions(actor, id);
  }

  @Post(':id/reject')
  @Roles(PlatformRole.WORKER)
  reject(
    @Actor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rejectConditionsSchema)) body: { reason: string },
  ): Promise<RelationshipView> {
    return this.relationships.rejectConditions(actor, id, body.reason);
  }

  @Get(':id/work-schedule')
  getSchedule(
    @Actor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ScheduleView | null> {
    return this.schedules.get(actor, id);
  }

  @Put(':id/work-schedule')
  @Roles(PlatformRole.FAMILY_EMPLOYER)
  putSchedule(
    @Actor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(putWorkScheduleSchema))
    body: Parameters<WorkSchedulesService['put']>[2],
  ): Promise<ScheduleView> {
    return this.schedules.put(actor, id, body);
  }
}
