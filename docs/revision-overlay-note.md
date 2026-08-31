# Same-edition revision overlay safety

A user-authorized same-edition revision is an incremental editorial overlay over the current latest Canonical edition. It must preserve previously published entries and the current release calendar when the new immutable packet omits them because adjacent/current-edition deduplication has already consumed those facts.

For an authorized revision only:

- an included decision with the same `title_key` replaces that entry in place and preserves its stable entry ID;
- verified existing editorial media is retained when the matching story is revised;
- previously published entries not represented by a new include decision remain in the edition;
- genuinely new included stories append using the next unused section index;
- the current upcoming calendar remains the base even when the editorial contract says `upcomingMode=replace`; explicit `removeUpcomingIds` can still remove items and submitted upcoming items can update them;
- existing Canonical tracking state is retained.

Normal new editions keep the existing full-build and `upcomingMode=replace` semantics. This rule exists specifically to prevent a same-edition acceptance rerun from deleting already verified Canonical content merely because the current-edition dedup layer does not send that content back through the new packet.
