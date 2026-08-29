/* Endereço e chave pública do Supabase.
 *
 * A chave abaixo é a "publishable" e é pública por desenho: ela vai no
 * navegador de todo mundo. Quem protege os dados não é ela, é o Row Level
 * Security da tabela "bancada", que só deixa cada conta enxergar as
 * próprias linhas.
 *
 * NUNCA ponha aqui a chave "service_role" / "secret": ela ignora o RLS.
 *
 * Deixando os dois vazios, o app funciona normalmente, só sem sincronizar.
 */
window.BANCADA_CONFIG = {
  url: "https://tduvbmmcumkknluooqyn.supabase.co",
  chave: "sb_publishable_xYyDTRAI_I7lihARpQ9oYw_Bb81IHRy"
};
