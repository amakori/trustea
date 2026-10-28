package com.instapay.android.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.instapay.android.InstapayApp
import com.instapay.android.R
import com.instapay.android.data.HeartbeatPayload
import com.instapay.android.network.RetrofitClient
import com.instapay.android.network.SocketManager
import com.instapay.android.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.ResponseBody
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

class GatewayForegroundService : Service() {

    companion object {
        const val TAG = "GatewayService"
        const val NOTIFICATION_ID = 1001

        fun start(context: Context) {
            val intent = Intent(context, GatewayForegroundService::class.java)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, GatewayForegroundService::class.java)
            context.stopService(intent)
        }
    }

    private val serviceJob = Job()
    private val serviceScope = CoroutineScope(Dispatchers.IO + serviceJob)

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "GatewayForegroundService onCreate")
        startForeground(NOTIFICATION_ID, createNotification("Connecting to Instapay Hub..."))
        connectToHub()
        startHeartbeatLoop()
    }

    private fun connectToHub() {
        val hubUrl = InstapayApp.instance.prefs.hubUrl
        val deviceId = InstapayApp.instance.prefs.gatewayId

        SocketManager.connect(hubUrl, deviceId)
        SocketManager.onConnectionStateChanged = { connected ->
            val statusText = if (connected) "Online | Connected to Hub" else "Reconnecting to Hub..."
            updateNotification(statusText)
        }
    }

    private fun startHeartbeatLoop() {
        serviceScope.launch {
            while (isActive) {
                sendHeartbeat()
                delay(30000) // Every 30 seconds
            }
        }
    }

    private fun sendHeartbeat() {
        val batteryLevel = getBatteryPercentage()
        val balance = InstapayApp.instance.prefs.lastReportedBalance.toDouble()
        val hubUrl = InstapayApp.instance.prefs.hubUrl

        try {
            val apiService = RetrofitClient.getApiService(hubUrl)
            val call = apiService.sendHeartbeat(
                HeartbeatPayload(
                    batteryLevel = batteryLevel,
                    balance = balance,
                    status = if (SocketManager.isConnected()) "idle" else "offline"
                )
            )
            call.enqueue(object : Callback<ResponseBody> {
                override fun onResponse(call: Call<ResponseBody>, response: Response<ResponseBody>) {}
                override fun onFailure(call: Call<ResponseBody>, t: Throwable) {}
            })
        } catch (e: Exception) {
            Log.e(TAG, "Heartbeat error: ${e.message}")
        }
    }

    private fun getBatteryPercentage(): Int {
        val batteryStatus: Intent? = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        return if (level >= 0 && scale > 0) (level * 100 / scale) else 100
    }

    private fun createNotification(contentText: String): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, InstapayApp.CHANNEL_ID)
            .setContentTitle("Instapay Airtel Gateway Active")
            .setContentText(contentText)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(text: String) {
        val manager = getSystemService(NOTIFICATION_SERVICE) as? android.app.NotificationManager
        manager?.notify(NOTIFICATION_ID, createNotification(text))
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceJob.cancel()
        SocketManager.disconnect()
        Log.d(TAG, "GatewayForegroundService onDestroy")
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
