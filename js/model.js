'use strict';

/*
 * Une classe :
 * {
 *   id, name, createdAt, updatedAt,
 *   columns: [{ rows, seats }],           // de gauche à droite en regardant le tableau
 *   students: [{ id, lastName, firstName, photo }],
 *   assignments: { "colonne-rangée-place": studentId }
 * }
 */
const Model = {
  create() {
    const now = Date.now();
    return {
      id: uid(),
      name: '',
      columns: [{ rows: 4, seats: 2 }, { rows: 4, seats: 4 }, { rows: 4, seats: 2 }],
      students: [],
      assignments: {},
      createdAt: now,
      updatedAt: now,
    };
  },

  seatId(col, row, place) {
    return `${col + 1}-${row + 1}-${place + 1}`;
  },

  seats(cls) {
    const ids = [];
    cls.columns.forEach((col, c) => {
      for (let r = 0; r < col.rows; r++) {
        for (let p = 0; p < col.seats; p++) ids.push(Model.seatId(c, r, p));
      }
    });
    return ids;
  },

  seatCount(cls) {
    return cls.columns.reduce((n, col) => n + col.rows * col.seats, 0);
  },

  /** Retire les affectations vers des places ou des élèves qui n'existent plus. */
  sanitize(cls) {
    const seats = new Set(Model.seats(cls));
    const ids = new Set(cls.students.map(s => s.id));
    const used = new Set();
    for (const [seat, sid] of Object.entries(cls.assignments)) {
      if (!seats.has(seat) || !ids.has(sid) || used.has(sid)) delete cls.assignments[seat];
      else used.add(sid);
    }
    return cls;
  },

  /** Nettoie une classe venant d'un fichier importé. */
  normalize(raw) {
    const now = Date.now();
    const cls = {
      id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
      name: String(raw.name || 'Classe importée'),
      columns: (Array.isArray(raw.columns) ? raw.columns : []).slice(0, 12).map(c => ({
        rows: clampInt(c && c.rows, 1, 20, 1),
        seats: clampInt(c && c.seats, 1, 10, 1),
      })),
      students: (Array.isArray(raw.students) ? raw.students : []).map(s => ({
        id: String((s && s.id) || uid()),
        lastName: String((s && s.lastName) || ''),
        firstName: String((s && s.firstName) || ''),
        photo: safePhoto(s && s.photo),
      })),
      assignments: {},
      createdAt: Number(raw.createdAt) || now,
      updatedAt: Number(raw.updatedAt) || now,
    };
    if (!cls.columns.length) cls.columns = [{ rows: 4, seats: 2 }];
    if (raw.assignments && typeof raw.assignments === 'object') {
      for (const [seat, sid] of Object.entries(raw.assignments)) cls.assignments[String(seat)] = String(sid);
    }
    return Model.sanitize(cls);
  },

  label(student) {
    return [student.lastName, student.firstName].filter(Boolean).join(' ') || 'Sans nom';
  },

  sorted(students) {
    return students.slice().sort((a, b) => Model.label(a).localeCompare(Model.label(b), 'fr'));
  },

  /** Enregistre une classe : envoie vers Supabase Storage les photos pas encore mises en ligne
   *  (data URL locales), et retire du Storage les photos des élèves qui ne sont plus dans la classe. */
  async save(cls) {
    cls.updatedAt = Date.now();
    const previous = await DB.get(cls.id);
    for (const s of cls.students) {
      if (Photos.isDataURL(s.photo)) s.photo = await Photos.upload(cls.id, s.id, s.photo);
    }
    if (previous) {
      const stillHere = new Set(cls.students.map(s => s.id));
      const removedPaths = previous.students
        .filter(s => !stillHere.has(s.id) && s.photo && !Photos.isDataURL(s.photo))
        .map(s => s.photo);
      if (removedPaths.length) await Photos.remove(removedPaths);
    }
    return DB.put(cls);
  },

  /** Sauvegarde exportable en `.json` : reconstitue les photos en data URL pour que le fichier
   *  reste autonome (utilisable hors ligne ou sur un autre projet), sans dépendre du Storage. */
  async exportData(classes) {
    const withPhotos = await Promise.all(classes.map(async cls => ({
      ...cls,
      students: await Promise.all(cls.students.map(async s => ({
        ...s,
        photo: s.photo && !Photos.isDataURL(s.photo) ? await Photos.download(s.photo) : (s.photo || ''),
      }))),
    })));
    return { app: 'plan-de-classe', version: 1, exportedAt: new Date().toISOString(), classes: withPhotos };
  },
};
