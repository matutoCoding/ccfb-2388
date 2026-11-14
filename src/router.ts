import { createRouter, createWebHashHistory } from 'vue-router'

import LibraryView from '@/views/LibraryView.vue'
import EditorView from '@/views/EditorView.vue'
import FoldView from '@/views/FoldView.vue'
import DeliverView from '@/views/DeliverView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/library' },
    { path: '/library', name: 'library', component: LibraryView, meta: { title: '工程库' } },
    { path: '/editor', name: 'editor', component: EditorView, meta: { title: '刀版编辑' } },
    { path: '/fold', name: 'fold', component: FoldView, meta: { title: '折叠校核' } },
    { path: '/deliver', name: 'deliver', component: DeliverView, meta: { title: '交付' } },
  ],
})
