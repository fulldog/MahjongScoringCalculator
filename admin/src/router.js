import { createRouter, createWebHashHistory } from 'vue-router'
import Login from './views/Login.vue'
import Layout from './views/Layout.vue'
import Overview from './views/Overview.vue'
import Users from './views/Users.vue'
import Matches from './views/Matches.vue'
import MatchDetail from './views/MatchDetail.vue'
import Minigames from './views/Minigames.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: Login },
    {
      path: '/',
      component: Layout,
      children: [
        { path: '', component: Overview },
        { path: 'users', component: Users },
        { path: 'matches', component: Matches },
        { path: 'matches/:id', component: MatchDetail },
        { path: 'minigames', component: Minigames }
      ]
    }
  ]
})

router.beforeEach((to) => {
  if (to.path !== '/login' && !localStorage.getItem('admin-token')) {
    return '/login'
  }
  return true
})

export default router
