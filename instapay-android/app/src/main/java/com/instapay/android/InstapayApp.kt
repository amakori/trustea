package com.instapay.android

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.instapay.android.data.AppPreferences
import com.instapay.android.data.LogItem
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class InstapayApp : Application() {

    companion object {
        const val CHANNEL_ID = "instapay_gateway_channel"
        lateinit var instance: InstapayApp
            private set
    }

    lateinit var prefs: AppPreferences
        private set

    val logStream = mutableListOf<LogItem>()
    var onLogAdded: ((LogItem) -> Unit)? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        prefs = AppPreferences(this)
        createNotificationChannel()
        addLog("SYSTEM", "Instapay Android Gateway initialized")
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Instapay Gateway Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps Instapay USSD automation and SMS gateway running"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    fun addLog(tag: String, message: String, isError: Boolean = false) {
        val time = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
        val item = LogItem(time, tag, message, isError)
        synchronized(logStream) {
            logStream.add(0, item)
            if (logStream.size > 200) {
                logStream.removeAt(logStream.size - 1)
            }
        }
        onLogAdded?.invoke(item)
    }
}
