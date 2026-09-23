'use strict';

/** Stockage des classes dans Supabase (base partagée par tout le personnel connecté). */
const DB = (() => {
  const TABLE = 'classes';

  function rowToClass(row) {
    return {
      id: row.id,
      name: row.name,
      columns: row.columns,
      students: row.students,
      assignments: row.assignments,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
    };
  }

  function classToRow(cls) {
    return {
      id: cls.id,
      name: cls.name,
      columns: cls.columns,
      students: cls.students,
      assignments: cls.assignments,
      created_at: new Date(cls.createdAt).toISOString(),
      updated_at: new Date(cls.updatedAt).toISOString(),
    };
  }

  async function all() {
    const { data, error } = await Supa.from(TABLE).select('*');
    if (error) throw error;
    return data.map(rowToClass);
  }

  async function get(id) {
    const { data, error } = await Supa.from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? rowToClass(data) : undefined;
  }

  async function put(cls) {
    const { error } = await Supa.from(TABLE).upsert(classToRow(cls));
    if (error) throw error;
    return cls;
  }

  async function remove(id) {
    const { error } = await Supa.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  }

  return { all, get, put, remove };
})();
