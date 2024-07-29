'use strict';

const form = document.querySelector('.form');
const containerWorkouts = document.querySelector('.workouts');
const inputType = document.querySelector('.form__input--type');
const inputDistance = document.querySelector('.form__input--distance');
const inputDuration = document.querySelector('.form__input--duration');
const inputCadence = document.querySelector('.form__input--cadence');
const inputElevation = document.querySelector('.form__input--elevation');
const deleteAll = document.querySelector('.deleteAll');
const sortSelect = document.querySelector('.sort--select');
const viewAllBtn = document.querySelector('.viewAll');

const DEFAULT_COORDS = [54.9784, -1.617439]; // Latitude and Longitude for Newcastle, UK

class Workout {
  date = new Date();
  id = (Date.now() + '').slice(-10);
  clicks = 0;

  constructor(coords, distance, duration) {
    this.coords = coords; // [lat, lng]
    this.distance = distance; //in km
    this.duration = duration; //in min
    this.type = '';
    this.pace = 0;
    this.cadence = 0;
    this.speed = 0;
  }

  setDescription() {
    // prettier-ignore
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    this.description = `${this.type[0].toUpperCase()}${this.type.slice(1)} on ${
      months[this.date.getMonth()]
    } ${this.date.getDate()}`;
  }

  click() {
    this.clicks++;
  }
  calcSpeed() {
    this.speed = this.distance / (this.duration / 60);
    return this.speed;
  }

  calcPace() {
    // min/km
    this.pace = this.duration / this.distance;
    return this.pace;
  }
}

// application Architechure
class App {
  #map;
  #mapZoomLevel = 13;
  #mapEvent;
  #workouts = [];
  #markers = [];
  editIndex;
  edit = false;
  #featureGroup = L.featureGroup();

  constructor() {
    // get users position
    this.#getposition();

    // get data from local storage
    // this.#getLocalStorage();

    // attach event handlers
    form.addEventListener('submit', this.#newWorkout.bind(this));
    inputType.addEventListener('change', this.#toggleElevationField);
    containerWorkouts.addEventListener('click', this.#editWorkout.bind(this));
    containerWorkouts.addEventListener('click', this.#deleteWorkout.bind(this));
    containerWorkouts.addEventListener('click', this.#moveToPopup.bind(this));
    deleteAll.addEventListener('click', this.#showDeleteAllModal.bind(this));
    sortSelect.addEventListener('change', this.#sortWorkouts.bind(this));
    viewAllBtn.addEventListener('click', this.#viewAll.bind(this));
  }

  #getposition() {
    navigator.geolocation.getCurrentPosition(
      this.#loadMap.bind(this),
      this.#loadMapWithDefault.bind(this)
    );
  }

  #loadMapWithDefault() {
    this.#loadMap({
      coords: { latitude: DEFAULT_COORDS[0], longitude: DEFAULT_COORDS[1] }
    });
  }

  #loadMap(position) {
    const { latitude } = position.coords;
    const { longitude } = position.coords;
    const coords = [latitude, longitude];

    this.#map = L.map('map').setView(coords, this.#mapZoomLevel);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.#map);

    this.#map.on('click', this.#showForm.bind(this));

    this.#workouts.forEach((work) => {
      this.#renderWorkoutMarker(work);
    });

    // draw
    // Add this to your map setup code
    const drawControl = new L.Control.Draw({
      draw: {
        marker: false, // Disable marker drawing
        polyline: true, // Enable polyline drawing
        polygon: true, // Enable polygon drawing
        circle: false, // Disable circle drawing
        rectangle: true // Enable rectangle drawing
      },
      edit: {
        featureGroup: this.#featureGroup, // Set the feature group to your map
        remove: true // Enable deletion of drawn items
      }
    });

    app.#map.addControl(drawControl);
  }

  #viewAll() {
    if (this.#workouts.length === 0) return;

    const workoutCoords = this.#workouts.map((workout) => workout.coords);

    const bounds = L.latLngBounds(workoutCoords);

    this.#map.fitBounds(bounds, { padding: [50, 50] });
  }

  #showForm(mapE) {
    this.#mapEvent = mapE;
    form.classList.remove('hidden');
    inputDistance.focus();
  }

  #hideForm() {
    // empty inputs
    inputDistance.value =
      inputDuration.value =
      inputCadence.value =
      inputElevation.value =
        '';
    form.style.display = 'none';
    form.classList.add('hidden');
    setTimeout(() => (form.style.display = 'grid'), 1000);
  }

  #toggleElevationField() {
    inputElevation.closest('.form__row').classList.toggle('form__row--hidden');
    inputCadence.closest('.form__row').classList.toggle('form__row--hidden');
  }

  #newWorkout(e) {
    const validInputs = (...inputs) =>
      inputs.every((inp) => Number.isFinite(inp));

    const allPosititive = (...inputs) => inputs.every((inp) => inp > 0);
    let workout;
    e.preventDefault();
    let lat, lng;
    // check if editing an existing workout

    const isEditing = this.edit;

    // get data from form
    const type = inputType.value;
    const distance = +inputDistance.value;
    const duration = +inputDuration.value;

    if (isEditing) {
      const workoutIndex = this.editIndex;

      workout = this.#workouts[workoutIndex];
      lat = this.#workouts[workoutIndex].coords[0];
      lng = this.#workouts[workoutIndex].coords[1];
      workout.distance = distance;
      workout.duration = duration;
      workout.type = type;
      workout.setDescription();

      const markerIndex = this.#markers.findIndex((marker) => {
        return marker.workoutId === workout.id;
      });
      if (markerIndex !== -1) {
        const marker = this.#markers[markerIndex].marker;
        marker.setPopupContent(
          `${workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️'} ${workout.description}`
        );
      }

      if (type === 'running') {
        const cadence = +inputCadence.value;
        workout.cadence = cadence;
        workout.calcPace();
      } else if (type === 'cycling') {
        const elevation = +inputElevation.value;
        workout.elevation = elevation;
        workout.calcSpeed();
      }
      return this.#renderWorkout(workout);
    }

    // Check if mapEvent is defined before accessing its properties
    lat = this.#mapEvent.latlng.lat;
    lng = this.#mapEvent.latlng.lng;

    const coords = [lat, lng];

    // if activity running, create runnning object
    if (type === 'running') {
      const cadence = +inputCadence.value;
      if (
        !validInputs(distance, duration, cadence) ||
        !allPosititive(distance, duration, cadence)
      )
        return alert('Inputs have to be positive numbers');

      workout = new Workout(coords, distance, duration);
      workout.type = 'running';
      workout.cadence = cadence;
      workout.calcPace();
      workout.setDescription();
    }
    // if activity is cycling, create cycling object
    if (type === 'cycling') {
      const elevation = +inputElevation.value;

      // check if data is valid
      if (
        !validInputs(distance, duration, elevation) ||
        !allPosititive(distance, duration)
      )
        return alert('Inputs have to be positive numbers');

      workout = new Workout(coords, distance, duration);
      workout.type = 'cycling';
      workout.elevation = elevation;
      workout.calcSpeed();
      workout.setDescription();
    }

    this.#workouts.push(workout);
    // render workout on map as marker
    this.#renderWorkoutMarker(workout);
    this.#renderWorkout(workout);

    // render workout on list

    // hide form and clear input fields
    this.#hideForm();

    // set local storage to all workouts
    // this.#setLocalStorage();
  }

  #renderWorkoutMarker(workout) {
    const marker = L.marker(workout.coords)
      .addTo(this.#map)
      .bindPopup(
        L.popup({
          maxWidth: 250,
          minWidth: 100,
          autoClose: false,
          closeOnClick: false,
          className: `${workout.type}-popup}`
        })
      )
      .setPopupContent(
        `${workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️'} ${workout.description}`
      )
      .openPopup();

    this.#markers.push({ workoutId: workout.id, marker });
  }

  #renderWorkout(workout) {
    let html = `
    
<li class="workout type workout--${workout.type}" data-id="${workout.id}">
<div class="workout__header">
<h2 class="workout__title">${workout.description}</h2>
<button class="edit">Edit</button>
<button class="close">x</button>
</div>
<div class="workout__details-container">
<div class="workout__details one">
  <span class="workout__icon">${workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️'}</span>
  <span class="workout__value distance">${workout.distance}</span>
  <span class="workout__unit">km</span>
</div>
<div class="workout__details 2">
  <span class="workout__icon">⏱</span>
  <span class="workout__value duration">${workout.duration}</span>
  <span class="workout__unit">min</span>
</div>`;

    if (workout.type === 'running') {
      html += `  <div class="workout__details">
  <span class="workout__icon">⚡️</span>
  <span class="workout__value pace">${workout.pace.toFixed(1)}</span>
  <span class="workout__unit">min/km</span>
</div>
<div class="workout__details 3">
  <span class="workout__icon">🦶🏼</span>
  <span class="workout__value cadence">${workout.cadence}</span>
  <span class="workout__unit">spm</span>
</div>
</div>
</li>`;
    }

    if (workout.type === 'cycling') {
      html += `<div class="workout__details">
      <span class="workout__icon">⚡️</span>
      <span class="workout__value speed">${workout.speed.toFixed(1)}</span>
      <span class="workout__unit">km/h</span>
    </div>
    <div class="workout__details 4">
      <span class="workout__icon">⛰</span>
      <span class="workout__value elevation">${workout.elevation}</span>
      <span class="workout__unit">m</span>
    </div>
    </div>
  </li>`;
    }

    if (app.edit) {
      const workoutEl = document.querySelector(`[data-id="${workout.id}"]`);
      workoutEl.outerHTML = html;
      app.edit = false;
      app.editIndex = null;
      this.#hideForm();
      return;
    }

    form.insertAdjacentHTML('afterend', html);
  }
  #moveToPopup(e) {
    const workoutEl = e.target.closest('.workout');
    if (!workoutEl) return;
    if (e.target.classList.contains('close')) return;

    const workout = this.#workouts.find(
      (work) => work.id === workoutEl.dataset.id
    );

    this.#map.setView(workout.coords, this.#mapZoomLevel, {
      animate: true,
      pan: {
        duration: 1
      }
    });

    workout.click();
  }

  #sortWorkouts() {
    const sortBy = document.querySelector('.sort--select').value;

    this.#workouts.sort((a, b) => {
      const speedA = a.type === 'running' ? a.pace : a.speed;
      const speedB = b.type === 'running' ? b.pace : b.speed;

      switch (sortBy) {
        case 'Date':
          return a.date.getTime() - b.date.getTime();
        case 'Distance':
          return a.distance - b.distance;
        case 'Duration':
          return a.duration - b.duration;
        case 'Speed':
          return speedA - speedB;
        case 'Type':
          return a.type.localeCompare(b.type);
        default:
          return a.date.getTime() - b.date.getTime();
      }
    });

    this.#clearWorkoutList();

    this.#workouts.forEach((workout) => {
      this.#renderWorkout(workout);
    });
  }

  #clearWorkoutList() {
    const domWorkout = containerWorkouts.querySelectorAll('.workout');

    domWorkout.forEach((workout) => workout.remove());
  }

  // #setLocalStorage() {
  //   localStorage.setItem('workouts', JSON.stringify(this.#workouts));
  // }

  // #getLocalStorage() {
  //   const data = JSON.parse(localStorage.getItem('workouts'));

  //   if (!data) return;

  //   this.#workouts = data;

  //   this.#workouts.forEach(work => {
  //     this.#renderWorkout(work);

  //   });
  // }

  reset() {
    localStorage.removeItem('workouts');
    location.reload();
  }

  #deleteWorkout(e) {
    const closeBtn = e.target.closest('.close');

    if (!closeBtn) return;

    const workoutEl = e.target.closest('.workout');

    const workoutIndex = this.#workouts.findIndex(
      (work) => work.id === workoutEl.dataset.id
    );

    if (workoutIndex === -1) return;

    const workoutId = this.#workouts[workoutIndex].id;

    const markerIndex = this.#markers.findIndex(
      (markerObj) => markerObj.workoutId === workoutId
    );

    if (markerIndex !== -1) {
      this.#markers[markerIndex].marker.remove();
      this.#markers.splice(markerIndex, 1);
    }

    // remove workout from array
    this.#workouts.splice(workoutIndex, 1);

    // remove workout from the dom
    workoutEl.remove();
  }

  #showDeleteAllModal() {
    const modal = document.getElementById('hs-slide-up-animation-modal');
    modal.classList.remove('hidden');

    const back = document.querySelector('.return');
    back.addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    const deletebtn = document.querySelector('.delete-all');

    deletebtn.addEventListener('click', () => {
      this.#deleteAll();
      modal.classList.add('hidden');
    });
  }

  #deleteAll(e) {
    if (this.#workouts.length === 0) return;

    this.#markers.forEach((marker) => marker.marker.remove());

    // edit to not editing
    this.edit = false;

    this.editIndex = undefined;

    this.#mapEvent = undefined;

    this.#markers = [];

    // remove workout from array
    this.#workouts = [];

    // dom delete
    this.#clearWorkoutList();
  }

  //  write an edit workout function that will allow the user to edit the workout

  #editWorkout(e) {
    if (e.target.classList.value !== 'edit') return;

    const workoutEl = e.target.closest('.workout');
    const workoutIndex = this.#workouts.findIndex(
      (work) => work.id === workoutEl.dataset.id
    );
    const workout = this.#workouts[workoutIndex];

    app.edit = true;
    app.editIndex = workoutIndex;

    // show form
    this.#showForm();

    if (workout.type === 'running') {
      inputCadence.value = workout.cadence;
      inputElevation.closest('.form__row').classList.add('form__row--hidden');
      inputCadence.closest('.form__row').classList.remove('form__row--hidden');
    }
    if (workout.type === 'cycling') {
      inputElevation.value = workout.elevation;
      inputCadence.closest('.form__row').classList.add('form__row--hidden');
      inputElevation
        .closest('.form__row')
        .classList.remove('form__row--hidden');
    }
    inputDistance.value = workout.distance;
    inputDuration.value = workout.duration;
  }
}

let app = new App();

// console.log(new Date());
// console.log((new Date() + '').slice(-10));
