import { EventsRep, SelectedEvent, TournamentsRep } from '../global-types';
import { NodeCGAPIClient } from '@nodecg/types/out/client/api/api.client';

declare const NodeCG: typeof NodeCGAPIClient;
declare const nodecg: NodeCGAPIClient;

const tournamentsRep = nodecg.Replicant<TournamentsRep>('tournamentsRep');
const selectedEvent = nodecg.Replicant<SelectedEvent>('selectedEvent');
const eventsRep = nodecg.Replicant<EventsRep>('eventsRep');

const tournamentFieldset = document.getElementById(
  'tournament-fieldset'
) as HTMLFieldSetElement;
tournamentFieldset.onchange = (e) => {
  if (!(e.target instanceof HTMLInputElement)) {
    nodecg.log.error('Fieldset event target is not an HTMLInputElement');
    return;
  }
  const i = parseInt(e.target.value);
  NodeCG.waitForReplicants(selectedEvent)
    .then(() => {
      const newVal = selectedEvent.value
        ? selectedEvent.value
        : { tournament: null, event: null };
      if (newVal.tournament !== i) newVal.event = null; 
      newVal.tournament = i;      
      selectedEvent.value = newVal;
    })
    .catch((err) => {
      nodecg.log.error(err);
    });
};
const eventFieldset = document.getElementById(
  'event-fieldset'
) as HTMLFieldSetElement;
eventFieldset.onchange = (e) => {
  if (!(e.target instanceof HTMLInputElement)) {
    nodecg.log.error('Fieldset event target is not an HTMLInputElement');
    return;
  }
  const i = parseInt(e.target.value);
  NodeCG.waitForReplicants(selectedEvent)
    .then(() => {
      const newVal = selectedEvent.value
        ? selectedEvent.value
        : { tournament: null, event: null };
      newVal.event = i;
      selectedEvent.value = newVal;
    })
    .catch((err) => {
      nodecg.log.error(err);
    });
};


selectedEvent.on('change', (newVal, oldVal) => {
  if (!newVal) return;
  if (oldVal && JSON.stringify(newVal) === JSON.stringify(oldVal)) return;
  const tourneyRadio = document.querySelector(`input[type="radio"][name="tournament"][value="${newVal.tournament}"]`) as HTMLInputElement;
  if (tourneyRadio) {
    tourneyRadio.checked = true;
  }
  const eventRadio = document.querySelector(`input[type="radio"][name="event"][value="${newVal.event}"]`) as HTMLInputElement;
  if (eventRadio) {
    eventRadio.checked = true;
  }
})

tournamentsRep.on('change', (newVal, oldVal) => {
  if (!newVal) return;
  if (oldVal && JSON.stringify(newVal) === JSON.stringify(oldVal)) return;
  NodeCG.waitForReplicants(selectedEvent)
    .then(() => {
      tournamentFieldset.innerHTML = '';
      newVal.forEach((tournament, i) => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'tournament';
        input.value = i.toString();
        input.checked =
          !!selectedEvent.value && selectedEvent.value.tournament === i;
        label.appendChild(input);
        label.appendChild(document.createTextNode(tournament.name));
        tournamentFieldset.appendChild(label);
      });
    })
    .catch((err) => {
      nodecg.log.error(err);
    });
});

eventsRep.on('change', (newVal, oldVal) => {
  if (!newVal) return;
  if (oldVal && JSON.stringify(newVal) === JSON.stringify(oldVal)) return;
  NodeCG.waitForReplicants(selectedEvent)
    .then(() => {
      eventFieldset.innerHTML = '';
      newVal.forEach((event, i) => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'event';
        input.value = i.toString();
        input.checked =
          !!selectedEvent.value && selectedEvent.value.event === i;
        label.appendChild(input);
        label.appendChild(document.createTextNode(event.name));
        eventFieldset.appendChild(label);
      });
    })
    .catch((err) => {
      nodecg.log.error(err);
    });
})

/* const stringRep = nodecg.Replicant<string>('string');

const stringInput = document.getElementById('string') as HTMLInputElement;
stringInput.onkeyup = (e) => {
	if (e.key === 'Enter') {
		stringRep.value = stringInput.value;
		console.log(`String Replicant updated to: ${stringRep.value}`);
	}
};

stringRep.on('change', (newVal, oldVal) => {
	console.log(`String changed from ${oldVal} to ${newVal}`);
  stringInput.value = newVal || '';
}); */
