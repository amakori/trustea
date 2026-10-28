package com.instapay.android.ui

import android.Manifest
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.LayoutInflater
import android.view.accessibility.AccessibilityManager
import android.widget.EditText
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import com.instapay.android.InstapayApp
import com.instapay.android.R
import com.instapay.android.accessibility.InstapayAccessibilityService
import com.instapay.android.databinding.ActivityMainBinding
import com.instapay.android.network.SocketManager
import com.instapay.android.service.GatewayForegroundService
import com.instapay.android.simulator.UssdSimulationDialog

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var logAdapter: LogAdapter

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val allGranted = permissions.entries.all { it.value }
        if (allGranted) {
            Toast.makeText(this, "All permissions granted!", Toast.LENGTH_SHORT).show()
            updatePermissionStatusUI()
        } else {
            Toast.makeText(this, "Permissions required for telephony & SMS automation.", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupRecyclerView()
        setupListeners()
        updateUI()

        // Start Gateway background service
        GatewayForegroundService.start(this)

        // Listen for log updates
        InstapayApp.instance.onLogAdded = {
            runOnUiThread {
                logAdapter.notifyItemInserted(0)
                binding.rvLogs.scrollToPosition(0)
            }
        }

        // Listen for socket connectivity updates
        SocketManager.onConnectionStateChanged = { isConnected ->
            runOnUiThread {
                updateConnectionStateUI(isConnected)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        updateUI()
    }

    private fun setupRecyclerView() {
        logAdapter = LogAdapter(InstapayApp.instance.logStream)
        binding.rvLogs.apply {
            layoutManager = LinearLayoutManager(this@MainActivity)
            adapter = logAdapter
        }
    }

    private fun setupListeners() {
        binding.btnEnableAccessibility.setOnClickListener {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            startActivity(intent)
        }

        binding.btnGrantPermissions.setOnClickListener {
            requestRequiredPermissions()
        }

        binding.btnConfigurePin.setOnClickListener {
            showPinSetupDialog()
        }

        binding.btnTestSimulation.setOnClickListener {
            UssdSimulationDialog.showSimulationPicker(this)
        }
    }

    private fun updateUI() {
        binding.tvGatewayId.text = InstapayApp.instance.prefs.gatewayId
        binding.tvWalletBalance.text = String.format("ZMW %.2f", InstapayApp.instance.prefs.lastReportedBalance)

        updateAccessibilityStatusUI()
        updatePermissionStatusUI()
        updateConnectionStateUI(SocketManager.isConnected())
    }

    private fun updateAccessibilityStatusUI() {
        val isEnabled = isAccessibilityServiceEnabled()
        if (isEnabled) {
            binding.btnEnableAccessibility.text = "Active"
            binding.btnEnableAccessibility.setTextColor(Color.parseColor("#10B981"))
            binding.btnEnableAccessibility.isEnabled = false
        } else {
            binding.btnEnableAccessibility.text = "Enable"
            binding.btnEnableAccessibility.setTextColor(Color.parseColor("#E11900"))
            binding.btnEnableAccessibility.isEnabled = true
        }
    }

    private fun updatePermissionStatusUI() {
        val hasSms = ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED
        val hasCall = ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED

        if (hasSms && hasCall) {
            binding.btnGrantPermissions.text = "Granted"
            binding.btnGrantPermissions.setTextColor(Color.parseColor("#10B981"))
            binding.btnGrantPermissions.isEnabled = false
        } else {
            binding.btnGrantPermissions.text = "Grant"
            binding.btnGrantPermissions.setTextColor(Color.parseColor("#E11900"))
            binding.btnGrantPermissions.isEnabled = true
        }
    }

    private fun updateConnectionStateUI(isConnected: Boolean) {
        if (isConnected) {
            binding.tvConnectionStatus.text = "Online"
            binding.tvConnectionStatus.setTextColor(Color.parseColor("#10B981"))
            binding.viewStatusDot.setBackgroundResource(R.drawable.shape_dot_online)
        } else {
            binding.tvConnectionStatus.text = "Disconnected"
            binding.tvConnectionStatus.setTextColor(Color.parseColor("#EF4444"))
            binding.viewStatusDot.setBackgroundResource(R.drawable.shape_dot_offline)
        }
    }

    private fun requestRequiredPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.CALL_PHONE,
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        permissionLauncher.launch(permissions.toTypedArray())
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        val am = getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        val enabledServices = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
        for (service in enabledServices) {
            if (service.id.contains(packageName)) {
                return true
            }
        }
        return false
    }

    private fun showPinSetupDialog() {
        val view = LayoutInflater.from(this).inflate(R.layout.dialog_pin_setup, null)
        val etAirtelPin = view.findViewById<EditText>(R.id.etAirtelPin)
        val etWithdrawPin = view.findViewById<EditText>(R.id.etWithdrawPin)
        val etHubUrl = view.findViewById<EditText>(R.id.etHubUrl)

        etAirtelPin.setText(InstapayApp.instance.prefs.airtelMoneyPin)
        etWithdrawPin.setText(InstapayApp.instance.prefs.withdrawPin)
        etHubUrl.setText(InstapayApp.instance.prefs.hubUrl)

        AlertDialog.Builder(this)
            .setView(view)
            .setPositiveButton("Save") { _, _ ->
                val newAirtelPin = etAirtelPin.text.toString().trim()
                val newWithdrawPin = etWithdrawPin.text.toString().trim()
                val newHubUrl = etHubUrl.text.toString().trim()

                if (newAirtelPin.length == 4) {
                    InstapayApp.instance.prefs.airtelMoneyPin = newAirtelPin
                }
                if (newWithdrawPin.length == 4) {
                    InstapayApp.instance.prefs.withdrawPin = newWithdrawPin
                }
                if (newHubUrl.isNotEmpty()) {
                    InstapayApp.instance.prefs.hubUrl = newHubUrl
                }

                Toast.makeText(this, "PIN & Gateway Settings saved securely", Toast.LENGTH_SHORT).show()
                InstapayApp.instance.addLog("CONFIG", "4-digit Airtel PIN and hub configuration updated")
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
}
