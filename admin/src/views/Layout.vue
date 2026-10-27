<template>
  <el-container class="shell">
    <el-aside width="200px">
      <div class="brand">捉鸡后台</div>
      <el-menu :default-active="route.path" router>
        <el-menu-item index="/">概览</el-menu-item>
        <el-menu-item index="/users">用户</el-menu-item>
        <el-menu-item index="/matches">牌局</el-menu-item>
        <el-menu-item index="/minigames">小游戏</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="top">
        <span />
        <el-button link @click="logout">退出</el-button>
      </el-header>
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

function logout() {
  localStorage.removeItem('admin-token')
  router.push('/login')
}
</script>

<style scoped>
.shell { min-height: 100vh; }
.brand { padding: 18px 16px; font-weight: 700; }
.top { display: flex; align-items: center; justify-content: flex-end; border-bottom: 1px solid #eee; }
</style>
