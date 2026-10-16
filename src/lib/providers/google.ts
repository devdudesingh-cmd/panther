import { JWT } from "google-auth-library";
import { env } from "@/lib/env";
import { config } from "@/config";

/**
 * Google Workspace: Meet REST API (unique space per session, open access so the
 * assistant bot can join before anyone else) with a Calendar conferenceData fallback,
 * plus a calendar invite to the parent.
 *
 * Auth: a service account with domain-wide delegation impersonating
 * GOOGLE_IMPERSONATE_USER. Scopes: meetings.space.created, calendar.events.
 */

export interface MeetingProvider {
  createMeeting(input: {
    sessionId: string;
    title: string;
    description: string;
    startsAt: string;
    endsAt: string;
    parentEmail: string;
    parentTz: string;
  }): Promise<{ meetUrl: string; meetSpace: string | null; calendarEventId: string | null }>;
  updateMeetingTime(eventId: string, startsAt: string, endsAt: string): Promise<void>;
  deleteMeeting(eventId: string | null): Promise<void>;
}

const SCOPES = ["https://www.googleapis.com/auth/meetings.space.created", "https://www.googleapis.com/auth/calendar.events"];

let cachedClient: JWT | null = null;

function client(): JWT {
  if (cachedClient) return cachedClient;
  const g = env("google");
  const sa = JSON.parse(g.GOOGLE_SERVICE_ACCOUNT_JSON) as { client_email: string; private_key: string };
  cachedClient = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: SCOPES,
    subject: g.GOOGLE_IMPERSONATE_USER,
  });
  return cachedClient;
}

interface MeetSpace {
  name: string;
  meetingUri: string;
  meetingCode: string;
}

async function createOpenMeetSpace(): Promise<MeetSpace> {
  const res = await client().request<MeetSpace>({
    url: "https://meet.googleapis.com/v2/spaces",
    method: "POST",
    data: { config: { accessType: "OPEN", entryPointAccess: "ALL" } },
  });
  return res.data;
}

interface CalendarEvent {
  id: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] };
}

function calendarUrl(path = ""): string {
  const id = encodeURIComponent(env("google").GOOGLE_CALENDAR_ID);
  return `https://www.googleapis.com/calendar/v3/calendars/${id}/events${path}`;
}

export function googleProvider(): MeetingProvider {
  return {
    async createMeeting(input) {
      const baseEvent = {
        summary: input.title,
        description: input.description,
        start: { dateTime: input.startsAt, timeZone: input.parentTz },
        end: { dateTime: input.endsAt, timeZone: input.parentTz },
        // The parent plus the tutors' inbox(es), so whoever is on shift has the Meet link on their calendar.
        attendees: [{ email: input.parentEmail }, ...config.tutoring.tutorInviteEmails.map((email) => ({ email }))],
        guestsCanInviteOthers: false,
        reminders: { useDefault: false, overrides: [{ method: "email", minutes: 60 }, { method: "popup", minutes: 10 }] },
        extendedProperties: { private: { panther_session_id: input.sessionId } },
      };

      // 1) Preferred: a dedicated Meet space with open access.
      let space: MeetSpace | null = null;
      try {
        space = await createOpenMeetSpace();
      } catch (e) {
        console.warn("Meet REST API failed, falling back to Calendar conferenceData:", (e as Error).message);
      }

      if (space) {
        const res = await client().request<CalendarEvent>({
          url: calendarUrl("?conferenceDataVersion=1&sendUpdates=all"),
          method: "POST",
          data: {
            ...baseEvent,
            location: space.meetingUri,
            conferenceData: {
              conferenceSolution: { key: { type: "hangoutsMeet" } },
              conferenceId: space.meetingCode,
              entryPoints: [{ entryPointType: "video", uri: space.meetingUri, label: space.meetingUri.replace("https://", "") }],
            },
          },
        });
        return { meetUrl: space.meetingUri, meetSpace: space.name, calendarEventId: res.data.id };
      }

      // 2) Fallback: let Calendar generate the Meet link.
      const res = await client().request<CalendarEvent>({
        url: calendarUrl("?conferenceDataVersion=1&sendUpdates=all"),
        method: "POST",
        data: {
          ...baseEvent,
          conferenceData: {
            createRequest: { requestId: `panther-${input.sessionId}`, conferenceSolutionKey: { type: "hangoutsMeet" } },
          },
        },
      });
      const link =
        res.data.hangoutLink ?? res.data.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri;
      if (!link) throw new Error("Calendar did not return a Meet link");
      return { meetUrl: link, meetSpace: null, calendarEventId: res.data.id };
    },

    async updateMeetingTime(eventId, startsAt, endsAt) {
      await client().request({
        url: calendarUrl(`/${encodeURIComponent(eventId)}?sendUpdates=all`),
        method: "PATCH",
        data: { start: { dateTime: startsAt }, end: { dateTime: endsAt } },
      });
    },

    async deleteMeeting(eventId) {
      if (!eventId) return;
      try {
        await client().request({
          url: calendarUrl(`/${encodeURIComponent(eventId)}?sendUpdates=all`),
          method: "DELETE",
        });
      } catch (e) {
        const status = (e as { response?: { status?: number } }).response?.status;
        if (status !== 404 && status !== 410) throw e;
      }
    },
  };
}
