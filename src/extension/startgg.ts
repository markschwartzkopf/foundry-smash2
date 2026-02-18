import NodeCG from '@nodecg/types';
import { get } from './nodecg-api-context';
import { Tournament, User, Event } from './types/startgg-types';
import keys from '../keys.json';
import { EventsRep, SelectedEvent, TournamentsRep } from '../global-types';

const nodecg: NodeCG.ServerAPI = get();

const startggApiUrl = 'https://api.start.gg/gql/alpha';
const APIstrings = {
  getTournaments: () =>
    `{currentUser{id slug name tournaments{nodes{name id}}}}`,
  getTournamentEvents: (id: string) =>
    `{tournament(id:"${id}"){events{id name}}}`,
  getEventSets: (id: string, page: number) =>
    `{event(id: ${id}){sets(page: ${page}perPage:20filters:{showByes:true}){pageInfo{totalPages} nodes{id phaseGroup{id phase{phaseOrder}} wPlacement round winnerId slots{prereqId prereqType seed{seedNum} entrant{name} standing{stats{score{value}}}}}}}}`,
} as const;

const tournamentsRep = nodecg.Replicant<TournamentsRep>('tournamentsRep', {
  defaultValue: [],
});
const eventsRep = nodecg.Replicant<EventsRep>('eventsRep', {
  defaultValue: [],
});
const selectedEvent = nodecg.Replicant<SelectedEvent>('selectedEvent', {
  defaultValue: { tournament: null, event: null },
});

selectedEvent.on('change', (newVal, oldVal) => {
  if (!newVal) return;
  if (
    newVal.tournament === null &&
    (newVal.event !== null || eventsRep.value.length > 0)
  ) {
    eventsRep.value = [];
    selectedEvent.value = { tournament: null, event: null };
    startggRefresh();
    return;
  }
  if (oldVal && JSON.stringify(newVal) === JSON.stringify(oldVal)) return;

  startggRefresh();
});

type StartGGResponse =
  | { data: unknown; errors?: undefined }
  | { errors: unknown; data?: undefined }
  | { errorId: unknown; message?: string; data?: undefined };

async function startggFetch(queryString: string) {
  const resp = await fetch(startggApiUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${keys.startggKey}`,
    },
    body: JSON.stringify({ query: queryString }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(
      `StartGG HTTP ${resp.status} ${resp.statusText}: ${text.slice(0, 500)}`,
    );
  }

  const json = (await resp.json()) as unknown;

  if (typeof json !== 'object' || json === null) {
    throw new Error('Non-object response from StartGG API');
  }

  const jsonResponse = json as StartGGResponse;

  if ('errors' in jsonResponse && jsonResponse.errors)
    throw jsonResponse.errors;
  if ('errorId' in jsonResponse && jsonResponse.errorId)
    throw {
      message: jsonResponse.message ?? 'Unknown error from StartGG API',
      errorId: jsonResponse.errorId,
    };
  if (!('data' in jsonResponse))
    throw new Error('No data in response from StartGG API');
  if (
    jsonResponse.data === undefined ||
    jsonResponse.data === null ||
    typeof jsonResponse.data !== 'object'
  )
    throw new Error('Data in response from StartGG API is not an object');
  return jsonResponse.data; // as Record<string, unknown>;
}

function startggRefresh() {
  startggFetch(APIstrings.getTournaments())
    .then((resp) => {
      if ('currentUser' in resp && resp.currentUser) {
        const user = resp.currentUser;
        if (
          typeof user === 'object' &&
          'tournaments' in user &&
          user.tournaments &&
          typeof user.tournaments === 'object' &&
          'nodes' in user.tournaments &&
          Array.isArray(user.tournaments.nodes)
        ) {
          const repTournaments: TournamentsRep = [];
          user.tournaments.nodes.forEach((tournament) => {
            if (tournament && tournament.id && tournament.name)
              repTournaments.push({
                id: tournament.id,
                name: tournament.name,
              });
          });
          tournamentsRep.value = repTournaments;
          nodecg.log.info(
            `Fetched tournaments from StartGG user: ${user.name} (${user.slug})`,
          );
          if (selectedEvent.value.tournament !== null) {
            const tournament = tournamentsRep.value[selectedEvent.value.tournament];
            if (tournament) {
              return startggFetch(APIstrings.getTournamentEvents(tournament.id));
            } else return Promise.resolve(null);
          }
        }
      }
    })
    .then((resp) => {
      if (!resp) return Promise.resolve(null);
      if ('tournament' in resp && typeof resp.tournament === 'object' && resp.tournament !== null && 'events' in resp.tournament && Array.isArray(resp.tournament.events)) {
        const events = resp.tournament.events;
        const repEvents: EventsRep = [];
        events.forEach((event) => {
          if (event && event.id && event.name)
            repEvents.push({ id: event.id, name: event.name });
        });
        if (JSON.stringify(repEvents) !== JSON.stringify(eventsRep.value))
          selectedEvent.value.event = null;
        eventsRep.value = repEvents;
        if (selectedEvent.value.event !== null) {
          return startggFetchEventSets(repEvents[selectedEvent.value.event].id);
        } else return Promise.resolve(null);
      } else {
        return Promise.reject('No events in response from StartGG API');
      }
    })
    .then((sets) => {
      console.log('Fetched sets from StartGG:');
      console.log(sets);
    })
    .catch((err) => {
      nodecg.log.error('Error fetching update from StartGG:');
      nodecg.log.error(err);
    });
}

function startggFetchEventSets(
  eventId: string,
  page?: number,
  incomingSets?: MySet[],
) {
  if (!page) page = 1;
  return new Promise<MySet[]>((res, rej) => {
    console.log(`Fetching sets for event ${eventId} page ${page}`);
    startggFetch(APIstrings.getEventSets(eventId, page))
      .then((resp) => {
        if (!resp || !('event' in resp) || !resp.event || typeof resp.event !== 'object' || resp.event === null) {
          return Promise.reject('No event in response from StartGG API');
        }
        if (!('sets' in resp.event) || !resp.event.sets || typeof resp.event.sets !== 'object' || resp.event.sets === null) {
          return Promise.reject('No sets in response from StartGG API');
        }
        if (!('nodes' in resp.event.sets) || !Array.isArray(resp.event.sets.nodes)) {
          return Promise.reject('No nodes in response from StartGG API');
        }
        if (!('pageInfo' in resp.event.sets) || !resp.event.sets.pageInfo || typeof resp.event.sets.pageInfo !== 'object' || resp.event.sets.pageInfo === null) {
          return Promise.reject('No pageInfo in response from StartGG API');
        }
        if (!('totalPages' in resp.event.sets.pageInfo) || typeof resp.event.sets.pageInfo.totalPages !== 'number') {
          return Promise.reject('No totalPages in response from StartGG API');
        }
        const sets = resp.event.sets.nodes;
        const totalPages = resp.event.sets.pageInfo.totalPages;
        const repSets = sets
          .filter((set) => {
            return isUsableSet(set);
          })
          .map((inSet) => {
            const set = inSet as UsableStartGGSet;
            const rtn: MySet = {
              id: set.id,
              phaseGroupId: String(set.phaseGroup.id),
              phaseOrder: set.phaseGroup.phase.phaseOrder,
              wPlacement: set.wPlacement,
              round: set.round,
              winnerId: String(set.winnerId),
              slots: set.slots.map((slot) => {
                return {
                  prereqId: String(slot.prereqId),
                  prereqType: slot.prereqType,
                  seedNum: slot.seed ? slot.seed.seedNum : null,
                  entrantName: slot.entrant ? slot.entrant.name : null,
                  scoreValue: slot.standing
                    ? slot.standing.stats.score.value
                    : null,
                };
              }),
            };
            return rtn;
          });
        if (incomingSets) {
          incomingSets.push(...repSets);
        } else incomingSets = repSets;
        if (totalPages > page) {
          return startggFetchEventSets(eventId, page + 1, incomingSets);
        } else return Promise.resolve(incomingSets);
      })
      .then((sets) => {
        res(sets);
      })
      .catch((err) => {
        rej(err);
      });
  });
}

nodecg.listenFor('startggRefresh', () => {
  nodecg.log.info('Refreshing StartGG info');
  startggRefresh();
});

type MySet = {
  id: string;
  phaseGroupId: string;
  phaseOrder: number;
  wPlacement: number;
  round: number;
  winnerId: string;
  slots: {
    prereqId: string | null;
    prereqType: string;
    seedNum: number | null;
    entrantName: string | null;
    scoreValue: number | null;
  }[];
};

type UsableStartGGSet = {
  id: string;
  phaseGroup: { id: string; phase: { phaseOrder: number } };
  wPlacement: number;
  round: number;
  winnerId: number;
  slots: {
    prereqId: string | number;
    prereqType: string;
    seed: { seedNum: number } | null;
    entrant: { name: string } | null;
    standing: { stats: { score: { value: number | null } } } | null;
  }[];
};
function isUsableSet(set: unknown): set is UsableStartGGSet {
  if (!set || typeof set !== 'object' || set === null) {
    nodecg.log.error('Set is null or undefined');
    return false;
  }
  if (!('slots' in set) || !Array.isArray(set.slots)) {
    nodecg.log.error(`Set has no slots. Offending set: ${JSON.stringify(set)}`);
    return false;
  }
  if (set.slots.length !== 2) {
    nodecg.log.error(
      `Set has no 2 slots. Offending set: ${JSON.stringify(set)}`,
    );
    return false;
  }
  if (
    set.slots.every((slot: unknown) => {
      return !(typeof slot === 'object' && slot !== null) || !('prereqType' in slot) || slot.prereqType === 'bye';
    })
  ) {
    //console.log(`Skipping set with no players`);
    return false;
  }
  set.slots.forEach((slot: any) => {
    if (!slot) {
      nodecg.log.error(
        `Slot is null or undefined. Offending set: ${JSON.stringify(set)}`,
      );
      return false;
    }
    if (typeof slot.prereqId !== 'string' && slot.prereqId !== null) {
      nodecg.log.error(
        `Slot has no prereqId. Offending set: ${JSON.stringify(set)}`,
      );
      return false;
    }
    if (typeof slot.prereqType !== 'string') {
      nodecg.log.error(
        `Slot has no prereqType. Offending set: ${JSON.stringify(set)}`,
      );
      return false;
    }
    if (!slot.seed && slot.prereqType !== 'bye') {
      nodecg.log.error(
        `Slot has no seed. Offending set: ${JSON.stringify(set)}`,
      );
      return false;
    }
    if (slot.seed && typeof slot.seed.seedNum !== 'number') {
      nodecg.log.error(
        `Slot has no seedNum. Offending set: ${JSON.stringify(set)}`,
      );
      return false;
    }
    if (!slot.entrant) {
      if (slot.entrant !== null) {
        nodecg.log.error(
          `Slot has no entrant. Offending set: ${JSON.stringify(set)}`,
        );
        return false;
      }
    } else if (typeof slot.entrant.name !== 'string') {
      nodecg.log.error(
        `Slot has no entrant name. Offending set: ${JSON.stringify(set)}`,
      );
      return false;
    }
    if (!slot.standing) {
      if (slot.standing !== null) {
        nodecg.log.error(
          `Slot has no standing. Offending set: ${JSON.stringify(set)}`,
        );
        return false;
      }
    } else {
      if (!slot.standing.stats) {
        nodecg.log.error(
          `Slot has no standing stats. Offending set: ${JSON.stringify(set)}`,
        );
        return false;
      }
      if (!slot.standing.stats.score) {
        nodecg.log.error(
          `Slot has no standing score. Offending set: ${JSON.stringify(set)}`,
        );
        return false;
      }
      if (
        typeof slot.standing.stats.score.value !== 'number' &&
        slot.standing.stats.score.value !== null
      ) {
        nodecg.log.error(
          `Slot has no standing score value. Offending set: ${JSON.stringify(set)} \n\r Offending slot: ${JSON.stringify(slot)}`,
        );
        return false;
      }
    }
  });
  if (typeof set.id !== 'string' && typeof set.id !== 'number') {
    nodecg.log.error(`Set has no id. Offending set: ${JSON.stringify(set)}`);
    return false;
  }
  if (!set.phaseGroup) {
    nodecg.log.error(
      `Set has no phaseGroup. Offending set: ${JSON.stringify(set)}`,
    );
    return false;
  }
  if (
    typeof set.phaseGroup.id !== 'string' &&
    typeof set.phaseGroup.id !== 'number'
  ) {
    nodecg.log.error(
      `Set has no phaseGroup id. Offending set: ${JSON.stringify(set)}`,
    );
    return false;
  }
  if (!set.phaseGroup.phase) {
    nodecg.log.error(
      `Set has no phaseGroup phase. Offending set: ${JSON.stringify(set)}`,
    );
    return false;
  }
  if (typeof set.phaseGroup.phase.phaseOrder !== 'number') {
    nodecg.log.error(
      `Set has no phaseGroup phaseOrder. Offending set: ${JSON.stringify(set)}`,
    );
    return false;
  }
  if (typeof set.wPlacement !== 'number') {
    nodecg.log.error(
      `Set has no wPlacement. Offending set: ${JSON.stringify(set)}`,
    );
    return false;
  }
  if (typeof set.round !== 'number') {
    nodecg.log.error(`Set has no round. Offending set: ${JSON.stringify(set)}`);
    return false;
  }
  if (!(`winnerId` in set)) {
    nodecg.log.error(
      `Set has no winnerId. Offending set: ${JSON.stringify(set)}`,
    );
    return false;
  }

  return true;
}
